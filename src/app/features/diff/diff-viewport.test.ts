import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDiffRowOffsets, calculateDiffViewport, calculateVariableDiffViewport, DIFF_LINE_HEIGHT } from './diff-viewport.js';

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

test('variable diff viewport uses wrapped row heights and offsets', () => {
  const rowOffsets = buildDiffRowOffsets([DIFF_LINE_HEIGHT, DIFF_LINE_HEIGHT * 3, DIFF_LINE_HEIGHT, DIFF_LINE_HEIGHT * 2]);
  const viewport = calculateVariableDiffViewport({ rowOffsets, scrollTop: DIFF_LINE_HEIGHT + 2, viewportHeight: DIFF_LINE_HEIGHT * 2 });

  assert.deepEqual(viewport, {
    start: 0,
    end: 4,
    offsetTop: 0,
    totalHeight: DIFF_LINE_HEIGHT * 7,
    rowOffsets,
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
