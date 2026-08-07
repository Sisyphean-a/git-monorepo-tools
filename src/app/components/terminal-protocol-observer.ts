export type TerminalProtocolDeliveryState = 'waiting' | 'pending-xterm' | 'delivered';
export type TerminalKeyboardProtocolState = 'unknown' | 'requested' | 'negotiated' | 'disabled';
export type TerminalMouseTrackingMode = 'none' | 'x10' | 'vt200' | 'drag' | 'any';

export interface TerminalProtocolSnapshot {
  readonly delivery: TerminalProtocolDeliveryState;
  readonly bracketedPasteRequested: boolean | null;
  readonly bracketedPasteEnabled: boolean | null;
  readonly keyboard: TerminalKeyboardProtocolState;
  readonly alternateScreenRequested: boolean | null;
  readonly mouseTrackingRequested: TerminalMouseTrackingMode | null;
  readonly mouseTrackingEnabled: TerminalMouseTrackingMode | null;
  readonly sgrMouseRequested: boolean | null;
}

export interface TerminalModeSnapshot {
  readonly bracketedPasteMode: boolean;
  readonly mouseTrackingMode: TerminalMouseTrackingMode;
}

export const PI_FULLSCREEN_MOUSE_ENABLE_SEQUENCE = '\x1b[?1000h\x1b[?1002h\x1b[?1003h\x1b[?1004h\x1b[?1006h';
export const PI_FULLSCREEN_MOUSE_DISABLE_SEQUENCE = '\x1b[?1006l\x1b[?1004l\x1b[?1003l\x1b[?1002l\x1b[?1000l';

const BRACKETED_PASTE_COMMAND = /\x1b\[\?2004([hl])/g;
const KEYBOARD_PROTOCOL_COMMAND = /\x1b\[>([0-9;]*)u/g;
const KEYBOARD_PROTOCOL_RESPONSE = /\x1b\[\?([0-9;]*)u/g;
const DEC_PRIVATE_MODE_COMMAND = /\x1b\[\?([0-9;]+)([hl])/g;
const OBSERVED_DEC_PRIVATE_MODES = new Set(['9', '1000', '1002', '1003', '1004', '1006', '1049', '2004']);
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
    alternateScreenRequested: null,
    mouseTrackingRequested: null,
    mouseTrackingEnabled: null,
    sgrMouseRequested: null,
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
      alternateScreenRequested: null,
      mouseTrackingRequested: null,
      mouseTrackingEnabled: null,
      sgrMouseRequested: null,
    });
  }

  observeOutput(chunk: string) {
    if (!chunk) {
      return false;
    }

    const output = this.outputTail + chunk;
    let bracketedPasteRequested = this.state.bracketedPasteRequested;
    let keyboard = this.state.keyboard;
    let alternateScreenRequested = this.state.alternateScreenRequested;
    let mouseTrackingRequested = this.state.mouseTrackingRequested;
    let sgrMouseRequested = this.state.sgrMouseRequested;

    for (const match of output.matchAll(BRACKETED_PASTE_COMMAND)) {
      bracketedPasteRequested = match[1] === 'h';
    }
    for (const match of output.matchAll(KEYBOARD_PROTOCOL_COMMAND)) {
      keyboard = protocolFlagsAreEnabled(match[1] ?? '') ? 'requested' : 'disabled';
    }
    for (const match of output.matchAll(DEC_PRIVATE_MODE_COMMAND)) {
      for (const command of (match[1] ?? '').split(';')) {
        if (command === '1049') {
          alternateScreenRequested = match[2] === 'h';
        } else if (command === '2004') {
          bracketedPasteRequested = match[2] === 'h';
        } else if (command === '1006') {
          sgrMouseRequested = match[2] === 'h';
        } else if (['9', '1000', '1002', '1003'].includes(command)) {
          mouseTrackingRequested = match[2] === 'h'
            ? mouseTrackingModeForCommand(command)
            : 'none';
        }
      }
    }

    this.outputTail = output.slice(-PROTOCOL_TAIL_LENGTH);
    return this.replace({
      ...this.state,
      delivery: 'pending-xterm',
      bracketedPasteRequested,
      keyboard,
      alternateScreenRequested,
      mouseTrackingRequested,
      sgrMouseRequested,
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
      mouseTrackingEnabled: modes.mouseTrackingMode,
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
      && this.state.keyboard === next.keyboard
      && this.state.alternateScreenRequested === next.alternateScreenRequested
      && this.state.mouseTrackingRequested === next.mouseTrackingRequested
      && this.state.mouseTrackingEnabled === next.mouseTrackingEnabled
      && this.state.sgrMouseRequested === next.sgrMouseRequested) {
      return false;
    }
    this.state = Object.freeze(next);
    return true;
  }
}

export function needsPiFullscreenMouseCompatibility(snapshot: TerminalProtocolSnapshot) {
  return snapshot.delivery === 'delivered'
    && snapshot.alternateScreenRequested === true
    && snapshot.bracketedPasteRequested === true
    && snapshot.mouseTrackingRequested === null
    && (snapshot.keyboard === 'requested' || snapshot.keyboard === 'negotiated');
}

export function extractTerminalProtocolCommands(chunk: string) {
  return [...chunk.matchAll(DEC_PRIVATE_MODE_COMMAND)]
    .filter(match => (match[1] ?? '').split(';').some(command => OBSERVED_DEC_PRIVATE_MODES.has(command)))
    .map(match => match[0])
    .join(' ');
}

function protocolFlagsAreEnabled(flags: string) {
  return flags.split(';').some(flag => Number(flag) > 0);
}

function mouseTrackingModeForCommand(command: string): TerminalMouseTrackingMode {
  switch (command) {
    case '9': return 'x10';
    case '1000': return 'vt200';
    case '1002': return 'drag';
    case '1003': return 'any';
    default: return 'none';
  }
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
  const alternateScreen = snapshot.alternateScreenRequested === null
    ? '尚未收到备用屏幕控制序列'
    : snapshot.alternateScreenRequested
      ? 'Pi 已请求进入'
      : 'Pi 已请求退出';
  const mouseTracking = snapshot.mouseTrackingRequested === null
    ? '尚未收到 Pi 鼠标控制序列'
    : snapshot.mouseTrackingEnabled === null
      ? `Pi 请求${describeMouseTrackingMode(snapshot.mouseTrackingRequested)}，等待 xterm 确认`
      : `Pi 请求${describeMouseTrackingMode(snapshot.mouseTrackingRequested)}；xterm 实际为${describeMouseTrackingMode(snapshot.mouseTrackingEnabled)}`;
  const sgrMouse = snapshot.sgrMouseRequested === null
    ? '尚未收到 SGR 鼠标控制序列'
    : snapshot.sgrMouseRequested
      ? 'Pi 已请求开启'
      : 'Pi 已请求关闭';
  return [
    `启动输出：${delivery}`,
    `受控粘贴：${bracketedPaste}`,
    `增强键盘：${keyboard}`,
    `备用屏幕：${alternateScreen}`,
    `鼠标跟踪：${mouseTracking}`,
    `SGR 鼠标：${sgrMouse}`,
  ].join('\n');
}

function describeMouseTrackingMode(mode: TerminalMouseTrackingMode) {
  switch (mode) {
    case 'none': return '关闭';
    case 'x10': return 'X10';
    case 'vt200': return 'VT200';
    case 'drag': return '拖动跟踪';
    case 'any': return '全量跟踪';
  }
}
