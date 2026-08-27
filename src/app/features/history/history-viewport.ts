export const HISTORY_LINE_HEIGHT = 56;
export const HISTORY_VIEWPORT_HEIGHT = 560;
const HISTORY_OVERSCAN_ROWS = 8;

interface HistoryViewportInput {
  rowCount: number;
  scrollTop: number;
  viewportHeight?: number;
}

export interface HistoryViewport {
  start: number;
  end: number;
  offsetTop: number;
  totalHeight: number;
}

export function calculateHistoryViewport(input: HistoryViewportInput): HistoryViewport {
  const rowCount = Math.max(0, Math.floor(input.rowCount));
  const viewportHeight = Math.max(0, input.viewportHeight ?? HISTORY_VIEWPORT_HEIGHT);
  const maxScrollTop = Math.max(0, rowCount * HISTORY_LINE_HEIGHT - viewportHeight);
  const scrollTop = Math.min(Math.max(0, input.scrollTop), maxScrollTop);
  const firstVisible = Math.floor(scrollTop / HISTORY_LINE_HEIGHT);
  const visibleRows = Math.ceil(viewportHeight / HISTORY_LINE_HEIGHT);
  const start = Math.max(0, firstVisible - HISTORY_OVERSCAN_ROWS);
  const end = Math.min(rowCount, firstVisible + visibleRows + HISTORY_OVERSCAN_ROWS);

  return {
    start,
    end,
    offsetTop: start * HISTORY_LINE_HEIGHT,
    totalHeight: rowCount * HISTORY_LINE_HEIGHT,
  };
}
