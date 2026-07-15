import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateDiffViewport, DIFF_LINE_HEIGHT } from './diff-viewport.js';

test('diff viewport renders visible rows with overscan', () => {
  const viewport = calculateDiffViewport({
    lineCount: 100,
    scrollTop: 20 * DIFF_LINE_HEIGHT,
    viewportHeight: 10 * DIFF_LINE_HEIGHT,
  });

  assert.deepEqual(viewport, {
    start: 12,
    end: 38,
    offsetTop: 12 * DIFF_LINE_HEIGHT,
    totalHeight: 100 * DIFF_LINE_HEIGHT,
  });
});

test('diff viewport clamps the first and last rows', () => {
  const first = calculateDiffViewport({
    lineCount: 5,
    scrollTop: -20,
    viewportHeight: 10 * DIFF_LINE_HEIGHT,
  });
  const last = calculateDiffViewport({
    lineCount: 100,
    scrollTop: 95 * DIFF_LINE_HEIGHT,
    viewportHeight: 10 * DIFF_LINE_HEIGHT,
  });

  assert.equal(first.start, 0);
  assert.equal(first.end, 5);
  assert.equal(last.end, 100);
});

test('diff viewport clamps a stale scroll position after content shrinks', () => {
  const viewport = calculateDiffViewport({
    lineCount: 5,
    scrollTop: 95 * DIFF_LINE_HEIGHT,
    viewportHeight: 10 * DIFF_LINE_HEIGHT,
  });

  assert.equal(viewport.start, 0);
  assert.equal(viewport.end, 5);
});
