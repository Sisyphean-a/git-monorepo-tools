export function indexDiffLines(content: string) {
  if (!content) {
    return new Uint32Array(0);
  }
  let lineCount = 1;
  for (let index = 0; index < content.length; index += 1) {
    if (content.charCodeAt(index) === 10) {
      lineCount += 1;
    }
  }
  const starts = new Uint32Array(lineCount);
  let lineIndex = 1;
  for (let index = 0; index < content.length; index += 1) {
    if (content.charCodeAt(index) === 10) {
      starts[lineIndex] = index + 1;
      lineIndex += 1;
    }
  }
  return starts;
}

export function getDiffLine(content: string, starts: ArrayLike<number>, index: number) {
  const start = starts[index] ?? content.length;
  const nextStart = starts[index + 1] ?? content.length;
  let end = nextStart;
  const endedWithLineFeed = end > start && content.charCodeAt(end - 1) === 10;
  if (endedWithLineFeed) {
    end -= 1;
  }
  if (endedWithLineFeed && end > start && content.charCodeAt(end - 1) === 13) {
    end -= 1;
  }
  return content.slice(start, end);
}

export function measureDiffWidth(content: string, starts: ArrayLike<number>) {
  let widest = 1;
  for (let index = 0; index < starts.length; index += 1) {
    widest = Math.max(widest, renderedColumns(getDiffLine(content, starts, index)));
  }
  return widest;
}

function renderedColumns(line: string) {
  let columns = 0;
  for (const character of line) {
    columns += character === '\t' ? 4 - (columns % 4) : 1;
  }
  return columns;
}
