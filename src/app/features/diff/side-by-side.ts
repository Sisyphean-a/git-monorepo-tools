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

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

export function filterSideBySideDisplayRows(rows: SideBySideRow[]) {
  return rows.filter((row): row is Extract<SideBySideRow, { kind: 'lines' }> => row.kind === 'lines');
}

export function countWrappedLineRows(text: string, maxColumns: number) {
  const widthLimit = Math.max(1, Math.floor(maxColumns));
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
  if (!content) return [];

  const lines = content.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();

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

  for (const rawLine of lines) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    const hunk = HUNK_HEADER.exec(line);
    if (hunk) {
      flushChanges();
      rows.push({ kind: 'hunk', text: line });
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[3]);
      inHunk = true;
      continue;
    }

    if (!inHunk) {
      rows.push({ kind: 'meta', text: line });
      continue;
    }

    if (line.startsWith('-')) {
      deleted.push({ lineNumber: oldLine, text: line.slice(1), kind: 'deleted' });
      oldLine += 1;
      continue;
    }
    if (line.startsWith('+')) {
      added.push({ lineNumber: newLine, text: line.slice(1), kind: 'added' });
      newLine += 1;
      continue;
    }
    if (line.startsWith(' ')) {
      flushChanges();
      rows.push({
        kind: 'lines',
        left: { lineNumber: oldLine, text: line.slice(1), kind: 'context' },
        right: { lineNumber: newLine, text: line.slice(1), kind: 'context' },
      });
      oldLine += 1;
      newLine += 1;
      continue;
    }

    flushChanges();
    rows.push({ kind: 'meta', text: line });
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
