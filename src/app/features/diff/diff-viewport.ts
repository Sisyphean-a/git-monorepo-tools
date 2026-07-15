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
