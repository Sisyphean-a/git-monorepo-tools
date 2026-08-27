import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateHistoryViewport, HISTORY_LINE_HEIGHT } from './history-viewport.js';

test('history viewport keeps the scrollable height while rendering an overscanned window', () => {
  const viewport = calculateHistoryViewport({ rowCount: 1000, scrollTop: 20 * HISTORY_LINE_HEIGHT, viewportHeight: 560 });

  assert.equal(viewport.totalHeight, 1000 * HISTORY_LINE_HEIGHT);
  assert.equal(viewport.offsetTop, viewport.start * HISTORY_LINE_HEIGHT);
  assert.ok(viewport.start < 20);
  assert.ok(viewport.end > 20);
  assert.ok(viewport.end - viewport.start < 40);
});

test('history viewport clamps invalid scroll positions and empty lists', () => {
  assert.deepEqual(calculateHistoryViewport({ rowCount: 0, scrollTop: 100, viewportHeight: 560 }), {
    start: 0,
    end: 0,
    offsetTop: 0,
    totalHeight: 0,
  });

  const viewport = calculateHistoryViewport({ rowCount: 10, scrollTop: -100, viewportHeight: 100 });
  assert.equal(viewport.start, 0);
  assert.equal(viewport.offsetTop, 0);
});
