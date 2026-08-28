export const DIFF_LINE_HEIGHT = 17;
export const DIFF_VIEWPORT_HEIGHT = 360;
const DIFF_OVERSCAN_ROWS = 8;

interface DiffViewportInput {
  lineCount: number;
  scrollTop: number;
  viewportHeight?: number;
}

export interface DiffViewport {
  start: number;
  end: number;
  offsetTop: number;
  totalHeight: number;
}

export function buildDiffRowOffsets(rowHeights: number[]) {
  const offsets = [0];
  for (const rowHeight of rowHeights) {
    const height = Number.isFinite(rowHeight) ? Math.max(DIFF_LINE_HEIGHT, Math.ceil(rowHeight)) : DIFF_LINE_HEIGHT;
    offsets.push((offsets[offsets.length - 1] ?? 0) + height);
  }
  return offsets;
}

export interface VariableDiffViewportInput {
  rowOffsets: number[];
  scrollTop: number;
  viewportHeight?: number;
}

export interface VariableDiffViewport extends DiffViewport {
  rowOffsets: number[];
}

export function calculateVariableDiffViewport(input: VariableDiffViewportInput): VariableDiffViewport {
  const rowOffsets = input.rowOffsets.length > 0 ? input.rowOffsets : [0];
  const lineCount = Math.max(0, rowOffsets.length - 1);
  const viewportHeight = Math.max(0, input.viewportHeight ?? DIFF_VIEWPORT_HEIGHT);
  const totalHeight = rowOffsets[lineCount] ?? 0;
  const maxScrollTop = Math.max(0, totalHeight - viewportHeight);
  const scrollTop = Math.min(Math.max(0, input.scrollTop), maxScrollTop);
  const firstVisible = Math.max(0, Math.min(lineCount - 1, upperBound(rowOffsets, scrollTop) - 1));
  const bottom = scrollTop + viewportHeight;
  const lastVisibleExclusive = Math.max(firstVisible + 1, lowerBound(rowOffsets, bottom));
  const start = Math.max(0, firstVisible - DIFF_OVERSCAN_ROWS);
  const end = Math.min(lineCount, lastVisibleExclusive + DIFF_OVERSCAN_ROWS);

  return {
    start,
    end,
    offsetTop: rowOffsets[start] ?? 0,
    totalHeight,
    rowOffsets,
  };
}

function lowerBound(values: number[], target: number) {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((values[middle] ?? Number.POSITIVE_INFINITY) < target) low = middle + 1;
    else high = middle;
  }
  return low;
}

function upperBound(values: number[], target: number) {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((values[middle] ?? Number.POSITIVE_INFINITY) <= target) low = middle + 1;
    else high = middle;
  }
  return low;
}

export function calculateDiffViewport(input: DiffViewportInput): DiffViewport {
  const lineCount = Math.max(0, Math.floor(input.lineCount));
  const viewportHeight = Math.max(0, input.viewportHeight ?? DIFF_VIEWPORT_HEIGHT);
  const maxScrollTop = Math.max(0, lineCount * DIFF_LINE_HEIGHT - viewportHeight);
  const scrollTop = Math.min(Math.max(0, input.scrollTop), maxScrollTop);
  const firstVisible = Math.floor(scrollTop / DIFF_LINE_HEIGHT);
  const visibleRows = Math.ceil(viewportHeight / DIFF_LINE_HEIGHT);
  const start = Math.max(0, firstVisible - DIFF_OVERSCAN_ROWS);
  const end = Math.min(lineCount, firstVisible + visibleRows + DIFF_OVERSCAN_ROWS);

  return {
    start,
    end,
    offsetTop: start * DIFF_LINE_HEIGHT,
    totalHeight: lineCount * DIFF_LINE_HEIGHT,
  };
}
