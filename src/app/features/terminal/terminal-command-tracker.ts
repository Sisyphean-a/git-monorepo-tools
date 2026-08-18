/**
 * Rule: shell prompts and output do not count as terminal content; only a submitted non-empty command does.
 */
export class TerminalCommandTracker {
  private line = '';

  recordWrittenInput(data: string) {
    let submitted = false;

    for (let index = 0; index < data.length; index += 1) {
      const character = data[index] ?? '';
      if (character === '\r' || character === '\n') {
        submitted ||= this.line.trim().length > 0;
        this.line = '';
        continue;
      }
      if (character === '\b' || character === '\x7f') {
        this.line = this.line.slice(0, -1);
        continue;
      }
      if (character === '\x1b') {
        index = skipEscapeSequence(data, index);
        continue;
      }
      if (character >= ' ') {
        this.line += character;
      }
    }

    return submitted;
  }

  reset() {
    this.line = '';
  }
}

function skipEscapeSequence(data: string, escapeIndex: number) {
  const next = data[escapeIndex + 1];
  if (next !== '[' && next !== ']') {
    return Math.min(escapeIndex + 1, data.length - 1);
  }

  for (let index = escapeIndex + 2; index < data.length; index += 1) {
    const character = data[index] ?? '';
    if (next === '[' ? character >= '@' && character <= '~' : character === '\x07') {
      return index;
    }
  }
  return data.length - 1;
}
