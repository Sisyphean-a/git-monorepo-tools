export type SideBySideCellKind = 'context' | 'added' | 'deleted' | 'empty';

export interface SideBySideCell {
  lineNumber: number | null;
  text: string;
  kind: SideBySideCellKind;
}

export type SideBySideRow =
  | { kind: 'meta'; text: string }
  | { kind: 'hunk'; text: string }
  | { kind: 'lines'; left: SideBySideCell; right: SideBySideCell };

export type SideBySideDisplayRow = Extract<SideBySideRow, { kind: 'lines' }>;

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

export function filterSideBySideDisplayRows(rows: SideBySideRow[]) {
  return rows.filter((row): row is SideBySideDisplayRow => row.kind === 'lines');
}

export function countWrappedLineRows(text: string, maxColumns: number) {
  const widthLimit = Math.max(1, Math.floor(maxColumns));
  if (text.length === 0) return 1;

  // 代码差异绝大多数是 ASCII；短行无需逐字符扫描，长 ASCII 行按字符数估算。
  if (text.indexOf('\t') === -1) {
    if (text.length <= widthLimit) return 1;
    let asciiWithoutTabs = true;
    for (let index = 0; index < text.length; index += 1) {
      if (text.charCodeAt(index) > 0x7f) {
        asciiWithoutTabs = false;
        break;
      }
    }
    if (asciiWithoutTabs) return Math.ceil(text.length / widthLimit);
  }

  let rows = 1;
  let columns = 0;
  for (const character of text) {
    const characterWidth = character === '\t' ? 4 - (columns % 4) : 1;
    if (columns > 0 && columns + characterWidth > widthLimit) {
      rows += 1;
      columns = 0;
    }
    if (characterWidth > widthLimit) {
      rows += Math.ceil(characterWidth / widthLimit) - 1;
      columns = characterWidth % widthLimit || widthLimit;
    } else {
      columns += characterWidth;
    }
  }
  return rows;
}

export function parseSideBySideDiff(content: string): SideBySideRow[] {
  return parseSideBySideRows(content, true);
}

// 查看器隐藏 Git 元数据和 hunk 标题；热路径只切出正文，避免为被丢弃的头部创建字符串。
export function parseSideBySideDisplayRows(content: string): SideBySideDisplayRow[] {
  if (!content) return [];

  const rows: SideBySideDisplayRow[] = [];
  let oldLine = 0;
  let newLine = 0;
  let inHunk = false;
  const deleted: SideBySideCell[] = [];
  const added: SideBySideCell[] = [];

  const flushChanges = () => {
    const count = Math.max(deleted.length, added.length);
    for (let index = 0; index < count; index += 1) {
      rows.push({
        kind: 'lines',
        left: deleted[index] ?? emptyCell(),
        right: added[index] ?? emptyCell(),
      });
    }
    deleted.length = 0;
    added.length = 0;
  };

  let lineStart = 0;
  while (lineStart < content.length) {
    const newline = content.indexOf('\n', lineStart);
    const lineEnd = newline === -1 ? content.length : newline;
    const contentEnd = lineEnd > lineStart && content.charCodeAt(lineEnd - 1) === 13 ? lineEnd - 1 : lineEnd;
    const firstCode = content.charCodeAt(lineStart);

    if (firstCode === 64) {
      const hunk = HUNK_HEADER.exec(content.slice(lineStart, contentEnd));
      if (hunk) {
        flushChanges();
        oldLine = Number(hunk[1]);
        newLine = Number(hunk[3]);
        inHunk = true;
      } else if (inHunk) {
        flushChanges();
      }
    } else if (inHunk && firstCode === 45) {
      deleted.push({ lineNumber: oldLine, text: content.slice(lineStart + 1, contentEnd), kind: 'deleted' });
      oldLine += 1;
    } else if (inHunk && firstCode === 43) {
      added.push({ lineNumber: newLine, text: content.slice(lineStart + 1, contentEnd), kind: 'added' });
      newLine += 1;
    } else if (inHunk && firstCode === 32) {
      flushChanges();
      const text = content.slice(lineStart + 1, contentEnd);
      rows.push({
        kind: 'lines',
        left: { lineNumber: oldLine, text, kind: 'context' },
        right: { lineNumber: newLine, text, kind: 'context' },
      });
      oldLine += 1;
      newLine += 1;
    } else if (inHunk) {
      flushChanges();
    }

    if (newline === -1) break;
    lineStart = newline + 1;
  }

  flushChanges();
  return rows;
}

function parseSideBySideRows(content: string, includeSpecialRows: boolean): SideBySideRow[] {
  if (!content) return [];

  const rows: SideBySideRow[] = [];
  let oldLine = 0;
  let newLine = 0;
  let inHunk = false;
  const deleted: SideBySideCell[] = [];
  const added: SideBySideCell[] = [];

  const flushChanges = () => {
    const count = Math.max(deleted.length, added.length);
    for (let index = 0; index < count; index += 1) {
      rows.push({
        kind: 'lines',
        left: deleted[index] ?? emptyCell(),
        right: added[index] ?? emptyCell(),
      });
    }
    deleted.length = 0;
    added.length = 0;
  };

  let lineStart = 0;
  while (lineStart < content.length) {
    const newline = content.indexOf('\n', lineStart);
    const lineEnd = newline === -1 ? content.length : newline;
    const contentEnd = lineEnd > lineStart && content.charCodeAt(lineEnd - 1) === 13 ? lineEnd - 1 : lineEnd;
    const line = content.slice(lineStart, contentEnd);
    const hunk = HUNK_HEADER.exec(line);
    if (hunk) {
      flushChanges();
      if (includeSpecialRows) rows.push({ kind: 'hunk', text: line });
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[3]);
      inHunk = true;
    } else if (!inHunk) {
      if (includeSpecialRows) rows.push({ kind: 'meta', text: line });
    } else if (line.startsWith('-')) {
      deleted.push({ lineNumber: oldLine, text: line.slice(1), kind: 'deleted' });
      oldLine += 1;
    } else if (line.startsWith('+')) {
      added.push({ lineNumber: newLine, text: line.slice(1), kind: 'added' });
      newLine += 1;
    } else if (line.startsWith(' ')) {
      flushChanges();
      const text = line.slice(1);
      rows.push({
        kind: 'lines',
        left: { lineNumber: oldLine, text, kind: 'context' },
        right: { lineNumber: newLine, text, kind: 'context' },
      });
      oldLine += 1;
      newLine += 1;
    } else {
      flushChanges();
      if (includeSpecialRows) rows.push({ kind: 'meta', text: line });
    }

    if (newline === -1) break;
    lineStart = newline + 1;
  }

  flushChanges();
  return rows;
}

export function measureSideBySideWidth(rows: SideBySideRow[]) {
  let left = 1;
  let right = 1;
  for (const row of rows) {
    if (row.kind !== 'lines') continue;
    left = Math.max(left, renderedColumns(row.left.text));
    right = Math.max(right, renderedColumns(row.right.text));
  }
  return { left, right };
}

function emptyCell(): SideBySideCell {
  return { lineNumber: null, text: '', kind: 'empty' };
}

function renderedColumns(line: string) {
  let columns = 0;
  for (const character of line) {
    columns += character === '\t' ? 4 - (columns % 4) : 1;
  }
  return columns;
}
