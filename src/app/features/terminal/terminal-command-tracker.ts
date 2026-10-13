/**
 * Rule: 初始提示符不算使用内容；非空命令与未提交的输入草稿都需要保留。
 */
export class TerminalCommandTracker {
  private line = '';
  private submittedCommand = false;
  private pendingInputs = 0;
  private uncertainLine = false;
  private composing = false;
  private pendingComposition: string | null = null;

  private get hasInputContent() {
    return this.submittedCommand || this.uncertainLine || this.line.length > 0;
  }

  get hasContent() {
    return this.pendingInputs > 0 || this.composing || this.pendingComposition !== null || this.hasInputContent;
  }

  beginComposition() {
    this.composing = true;
    this.pendingComposition = null;
  }

  endComposition(text: string) {
    this.composing = false;
    this.pendingComposition = text && !this.hasInputContent ? text : null;
  }

  retainPendingInput() {
    this.pendingInputs += 1;
    return () => { this.pendingInputs -= 1; };
  }

  recordWrittenInput(data: string) {
    let submitted = false;

    for (let index = 0; index < data.length; index += 1) {
      const character = data[index] ?? '';
      if (character === '\r' || character === '\n') {
        submitted ||= this.line.trim().length > 0 || this.uncertainLine;
        this.line = '';
        this.uncertainLine = false;
        continue;
      }
      if (character === '\b' || character === '\x7f') {
        this.line = this.line.slice(0, /[\uD800-\uDBFF][\uDC00-\uDFFF]$/.test(this.line) ? -2 : -1);
        continue;
      }
      if (character === '\x03') {
        this.line = '';
        this.uncertainLine = false;
        continue;
      }
      if ((character === '\x17' || character === '\x15') && this.line.length > 0) {
        this.uncertainLine = true;
        continue;
      }
      if (character === '\x1b') {
        const end = skipEscapeSequence(data, index);
        const sequence = data.slice(index, end + 1);
        // Rule: Shell 历史召回或光标编辑后无法可靠还原输入，不能误判为空并关闭。
        if (/^\x1b\[[\d;]*[AB]$/.test(sequence)
          || (this.line.length > 0 && /^\x1b\[[\d;]*[CDFH]$/.test(sequence))) this.uncertainLine = true;
        index = end;
        continue;
      }
      if (character >= ' ') {
        this.line += character;
      }
    }

    this.submittedCommand ||= submitted;
    if (this.pendingComposition !== null && (data === this.pendingComposition || this.hasInputContent)) this.pendingComposition = null;
    return submitted;
  }

  reset() {
    this.line = '';
    this.submittedCommand = false;
    this.uncertainLine = false;
  }
}

function skipEscapeSequence(data: string, escapeIndex: number) {
  const next = data[escapeIndex + 1];
  const controlString = next === ']' || next === 'P' || next === 'X' || next === '^' || next === '_';
  if (next !== '[' && !controlString) {
    return Math.min(escapeIndex + 1, data.length - 1);
  }

  for (let index = escapeIndex + 2; index < data.length; index += 1) {
    const character = data[index] ?? '';
    if (next === '[') {
      if (character >= '@' && character <= '~') return index;
      continue;
    }
    // Rule: xterm 的自动状态回复不是用户输入；控制字符串以 ST 结束，OSC 也接受 BEL。
    if (character === '\x9c' || (next === ']' && character === '\x07')) return index;
    if (character === '\x1b' && data[index + 1] === '\\') return index + 1;
  }
  return data.length - 1;
}
