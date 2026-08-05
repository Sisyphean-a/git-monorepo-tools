export type TerminalProtocolDeliveryState = 'waiting' | 'pending-xterm' | 'delivered';
export type TerminalKeyboardProtocolState = 'unknown' | 'requested' | 'negotiated' | 'disabled';

export interface TerminalProtocolSnapshot {
  readonly delivery: TerminalProtocolDeliveryState;
  readonly bracketedPasteRequested: boolean | null;
  readonly bracketedPasteEnabled: boolean | null;
  readonly keyboard: TerminalKeyboardProtocolState;
}

export interface TerminalModeSnapshot {
  readonly bracketedPasteMode: boolean;
}

const BRACKETED_PASTE_COMMAND = /\x1b\[\?2004([hl])/g;
const KEYBOARD_PROTOCOL_COMMAND = /\x1b\[>([0-9;]*)u/g;
const KEYBOARD_PROTOCOL_RESPONSE = /\x1b\[\?([0-9;]*)u/g;
const PROTOCOL_TAIL_LENGTH = 32;

/**
 * Flow: observes copies of terminal protocol bytes and xterm parse completion.
 * Guarantee: it never transforms, suppresses, or routes terminal output.
 */
export class TerminalProtocolObserver {
  private outputTail = '';
  private state: TerminalProtocolSnapshot = {
    delivery: 'waiting',
    bracketedPasteRequested: null,
    bracketedPasteEnabled: null,
    keyboard: 'unknown',
  };

  getSnapshot(): TerminalProtocolSnapshot {
    return this.state;
  }

  reset() {
    this.outputTail = '';
    return this.replace({
      delivery: 'waiting',
      bracketedPasteRequested: null,
      bracketedPasteEnabled: null,
      keyboard: 'unknown',
    });
  }

  observeOutput(chunk: string) {
    if (!chunk) {
      return false;
    }

    const output = this.outputTail + chunk;
    let bracketedPasteRequested = this.state.bracketedPasteRequested;
    let keyboard = this.state.keyboard;

    for (const match of output.matchAll(BRACKETED_PASTE_COMMAND)) {
      bracketedPasteRequested = match[1] === 'h';
    }
    for (const match of output.matchAll(KEYBOARD_PROTOCOL_COMMAND)) {
      keyboard = protocolFlagsAreEnabled(match[1] ?? '') ? 'requested' : 'disabled';
    }

    this.outputTail = output.slice(-PROTOCOL_TAIL_LENGTH);
    return this.replace({
      ...this.state,
      delivery: 'pending-xterm',
      bracketedPasteRequested,
      keyboard,
    });
  }

  observeXtermParsed(modes: TerminalModeSnapshot) {
    if (this.state.delivery === 'waiting') {
      return false;
    }
    return this.replace({
      ...this.state,
      delivery: 'delivered',
      bracketedPasteEnabled: modes.bracketedPasteMode,
    });
  }

  observeTerminalInput(data: string) {
    if (!KEYBOARD_PROTOCOL_RESPONSE.test(data)) {
      return false;
    }
    KEYBOARD_PROTOCOL_RESPONSE.lastIndex = 0;
    return this.replace({
      ...this.state,
      keyboard: 'negotiated',
    });
  }

  private replace(next: TerminalProtocolSnapshot) {
    if (this.state.delivery === next.delivery
      && this.state.bracketedPasteRequested === next.bracketedPasteRequested
      && this.state.bracketedPasteEnabled === next.bracketedPasteEnabled
      && this.state.keyboard === next.keyboard) {
      return false;
    }
    this.state = Object.freeze(next);
    return true;
  }
}

function protocolFlagsAreEnabled(flags: string) {
  return flags.split(';').some(flag => Number(flag) > 0);
}

export function formatTerminalProtocolSnapshot(snapshot: TerminalProtocolSnapshot) {
  const delivery = snapshot.delivery === 'waiting'
    ? '等待 Pi 启动输出'
    : snapshot.delivery === 'pending-xterm'
      ? '已收到输出，等待 xterm 处理'
      : '已交付并由 xterm 处理';
  const bracketedPaste = snapshot.bracketedPasteRequested === null
    ? '尚未收到控制序列'
    : snapshot.bracketedPasteEnabled === null
      ? `Pi 请求${snapshot.bracketedPasteRequested ? '开启' : '关闭'}，等待 xterm 确认`
      : snapshot.bracketedPasteEnabled
        ? '已开启（xterm 已确认）'
        : '未开启（xterm 已确认）';
  const keyboard = snapshot.keyboard === 'unknown'
    ? '尚未观测到协商'
    : snapshot.keyboard === 'requested'
      ? 'Pi 已请求，等待终端响应'
      : snapshot.keyboard === 'negotiated'
        ? '已收到 xterm 协商响应'
        : '已关闭';
  return [
    `启动输出：${delivery}`,
    `受控粘贴：${bracketedPaste}`,
    `增强键盘：${keyboard}`,
  ].join('\n');
}
