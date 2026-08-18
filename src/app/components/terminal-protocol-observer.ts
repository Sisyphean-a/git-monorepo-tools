export type TerminalProtocolDeliveryState = 'waiting' | 'pending-xterm' | 'delivered';
export type TerminalKeyboardProtocolState = 'unknown' | 'requested' | 'negotiated' | 'disabled';
export type TerminalMouseTrackingMode = 'none' | 'x10' | 'vt200' | 'drag' | 'any';

export interface TerminalProtocolSnapshot {
  readonly delivery: TerminalProtocolDeliveryState;
  readonly bracketedPasteRequested: boolean | null;
  readonly bracketedPasteEnabled: boolean | null;
  readonly keyboard: TerminalKeyboardProtocolState;
  readonly piTitle: boolean;
  readonly alternateScreenRequested: boolean | null;
  readonly mouseTrackingRequested: TerminalMouseTrackingMode | null;
  readonly mouseTrackingEnabled: TerminalMouseTrackingMode | null;
  readonly sgrMouseRequested: boolean | null;
}

export interface TerminalModeSnapshot {
  readonly bracketedPasteMode: boolean;
  readonly mouseTrackingMode: TerminalMouseTrackingMode;
}

export interface TerminalProtocolEffect {
  readonly type: 'write-xterm';
  readonly data: string;
  readonly trace: string;
}

export interface TerminalProtocolTransition {
  readonly snapshotChanged: boolean;
  readonly effects: readonly TerminalProtocolEffect[];
}

const PI_FULLSCREEN_MOUSE_ENABLE_SEQUENCE = '\x1b[?1000h\x1b[?1002h\x1b[?1003h\x1b[?1004h\x1b[?1006h';
const PI_FULLSCREEN_MOUSE_DISABLE_SEQUENCE = '\x1b[?1006l\x1b[?1004l\x1b[?1003l\x1b[?1002l\x1b[?1000l';

const BRACKETED_PASTE_COMMAND = /\x1b\[\?2004([hl])/g;
const KEYBOARD_PROTOCOL_COMMAND = /\x1b\[>([0-9;]*)u/g;
const KEYBOARD_PROTOCOL_RESPONSE = /\x1b\[\?([0-9;]*)u/g;
const DEC_PRIVATE_MODE_COMMAND = /\x1b\[\?([0-9;]+)([hl])/g;
const TERMINAL_TITLE_COMMAND = /\x1b]0;([^\x07\x1b]*)(?:\x07|\x1b\\)/g;
const OBSERVED_DEC_PRIVATE_MODES = new Set(['9', '1000', '1002', '1003', '1004', '1006', '1049', '2004']);
// Retain enough of a split OSC 0 title to cover Windows extended paths.
const PROTOCOL_TAIL_LENGTH = 4096;

/**
 * Flow: owns Pi protocol observation and the local compatibility effects caused by state transitions.
 * Guarantee: it never transforms, suppresses, routes, or directly writes terminal output.
 */
export class TerminalProtocolStateMachine {
  private outputTail = '';
  private sessionEnded = false;
  private piFullscreenMouseCompatibilityActive = false;
  private state: TerminalProtocolSnapshot = {
    delivery: 'waiting',
    bracketedPasteRequested: null,
    bracketedPasteEnabled: null,
    keyboard: 'unknown',
    piTitle: false,
    alternateScreenRequested: null,
    mouseTrackingRequested: null,
    mouseTrackingEnabled: null,
    sgrMouseRequested: null,
  };

  getSnapshot(): TerminalProtocolSnapshot {
    return this.state;
  }

  reset(): TerminalProtocolTransition {
    this.outputTail = '';
    this.sessionEnded = false;
    this.piFullscreenMouseCompatibilityActive = false;
    return this.transition(this.replace({
      delivery: 'waiting',
      bracketedPasteRequested: null,
      bracketedPasteEnabled: null,
      keyboard: 'unknown',
      piTitle: false,
      alternateScreenRequested: null,
      mouseTrackingRequested: null,
      mouseTrackingEnabled: null,
      sgrMouseRequested: null,
    }));
  }

  observeOutput(chunk: string): TerminalProtocolTransition {
    if (!chunk) {
      return this.transition(false);
    }

    const tailLength = this.outputTail.length;
    const output = this.outputTail + chunk;
    let bracketedPasteRequested = this.state.bracketedPasteRequested;
    let keyboard = this.state.keyboard;
    let piTitle = this.state.piTitle;
    let alternateScreenRequested = this.state.alternateScreenRequested;
    let mouseTrackingRequested = this.state.mouseTrackingRequested;
    let sgrMouseRequested = this.state.sgrMouseRequested;

    for (const match of output.matchAll(BRACKETED_PASTE_COMMAND)) {
      if (isNewProtocolMatch(match, tailLength)) {
        bracketedPasteRequested = match[1] === 'h';
      }
    }
    for (const match of output.matchAll(KEYBOARD_PROTOCOL_COMMAND)) {
      if (isNewProtocolMatch(match, tailLength)) {
        keyboard = protocolFlagsAreEnabled(match[1] ?? '') ? 'requested' : 'disabled';
      }
    }
    for (const match of output.matchAll(TERMINAL_TITLE_COMMAND)) {
      if (!isNewProtocolMatch(match, tailLength)) {
        continue;
      }
      // Apply OSC 0 titles in stream order. A batched protocol shutdown can
      // contain an incomplete Pi title followed by a shell title.
      const terminalTitle = match[1] ?? '';
      if (isPiTerminalTitle(terminalTitle)) {
        piTitle = true;
      } else if (isIncompletePiTerminalTitle(terminalTitle)) {
        piTitle = false;
      }
      // Other titles can be emitted by Pi's cmd/npm child processes. They do
      // not revoke an already confirmed Pi identity while its modes remain on.
    }
    for (const match of output.matchAll(DEC_PRIVATE_MODE_COMMAND)) {
      if (!isNewProtocolMatch(match, tailLength)) {
        continue;
      }
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

    if (bracketedPasteRequested === false || keyboard === 'disabled') {
      piTitle = false;
    }

    this.outputTail = output.slice(-PROTOCOL_TAIL_LENGTH);
    return this.transition(this.replace({
      ...this.state,
      delivery: 'pending-xterm',
      bracketedPasteRequested,
      keyboard,
      piTitle,
      alternateScreenRequested,
      mouseTrackingRequested,
      sgrMouseRequested,
    }));
  }

  observeXtermParsed(modes: TerminalModeSnapshot): TerminalProtocolTransition {
    if (this.state.delivery === 'waiting') {
      return this.transition(false);
    }
    const snapshotChanged = this.replace({
      ...this.state,
      delivery: 'delivered',
      bracketedPasteEnabled: modes.bracketedPasteMode,
      mouseTrackingEnabled: modes.mouseTrackingMode,
    });
    return this.transition(snapshotChanged, this.reconcilePiFullscreenMouse());
  }

  observeTerminalInput(data: string): TerminalProtocolTransition {
    if (!KEYBOARD_PROTOCOL_RESPONSE.test(data)) {
      return this.transition(false);
    }
    KEYBOARD_PROTOCOL_RESPONSE.lastIndex = 0;
    return this.transition(this.replace({
      ...this.state,
      keyboard: 'negotiated',
    }));
  }

  usesPiLineFeedPaste() {
    // Pi remains identifiable while later output waits for xterm's asynchronous parser.
    // ConPTY strips bracketed-paste delimiters and modified-key CSI, but raw LF survives.
    return this.state.piTitle
      && this.state.bracketedPasteRequested === true
      && this.state.bracketedPasteEnabled === true
      && (this.state.keyboard === 'requested' || this.state.keyboard === 'negotiated');
  }

  endSession(): TerminalProtocolTransition {
    this.sessionEnded = true;
    if (!this.piFullscreenMouseCompatibilityActive) {
      return this.transition(false);
    }
    this.piFullscreenMouseCompatibilityActive = false;
    return this.transition(false, [{
      type: 'write-xterm',
      data: PI_FULLSCREEN_MOUSE_DISABLE_SEQUENCE,
      trace: 'Windows ConPTY 兼容：终端进程已退出，已关闭本地鼠标协议',
    }]);
  }

  private reconcilePiFullscreenMouse(): readonly TerminalProtocolEffect[] {
    if (this.sessionEnded) {
      return [];
    }
    if (this.piFullscreenMouseCompatibilityActive) {
      if (this.state.alternateScreenRequested !== false) {
        return [];
      }
      this.piFullscreenMouseCompatibilityActive = false;
      return [{
        type: 'write-xterm',
        data: PI_FULLSCREEN_MOUSE_DISABLE_SEQUENCE,
        trace: 'Windows ConPTY 兼容：Pi 已退出全屏，已关闭本地鼠标协议',
      }];
    }
    if (!needsPiFullscreenMouseCompatibility(this.state)) {
      return [];
    }
    this.piFullscreenMouseCompatibilityActive = true;
    return [{
      type: 'write-xterm',
      data: PI_FULLSCREEN_MOUSE_ENABLE_SEQUENCE,
      trace: 'Windows ConPTY 兼容：已补回 Pi 被丢弃的鼠标协议',
    }];
  }

  private transition(
    snapshotChanged: boolean,
    effects: readonly TerminalProtocolEffect[] = [],
  ): TerminalProtocolTransition {
    return { snapshotChanged, effects };
  }

  private replace(next: TerminalProtocolSnapshot) {
    if (this.state.delivery === next.delivery
      && this.state.bracketedPasteRequested === next.bracketedPasteRequested
      && this.state.bracketedPasteEnabled === next.bracketedPasteEnabled
      && this.state.keyboard === next.keyboard
      && this.state.piTitle === next.piTitle
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

function needsPiFullscreenMouseCompatibility(snapshot: TerminalProtocolSnapshot) {
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

function isNewProtocolMatch(match: RegExpMatchArray, tailLength: number) {
  return (match.index ?? 0) + match[0].length > tailLength;
}

function isPiTerminalTitle(title: string) {
  return title === 'π' || /^π - \S/.test(title);
}

function isIncompletePiTerminalTitle(title: string) {
  return /^π - \s*$/.test(title);
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
