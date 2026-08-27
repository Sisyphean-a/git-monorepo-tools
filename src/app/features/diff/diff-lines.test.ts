import test from 'node:test';
import assert from 'node:assert/strict';
import { getDiffLine, indexDiffLines, measureDiffWidth } from './diff-lines.js';

test('diff line index preserves CRLF and trailing empty lines without copying content', () => {
  const content = 'first\r\nsecond\n';
  const starts = indexDiffLines(content);

  assert.deepEqual(Array.from(starts), [0, 7, 14]);
  assert.deepEqual(Array.from({ length: starts.length }, (_, index) => getDiffLine(content, starts, index)), ['first', 'second', '']);
});

test('diff line index preserves bare carriage returns', () => {
  const content = 'bare\rreturn';
  const starts = indexDiffLines(content);

  assert.deepEqual(Array.from({ length: starts.length }, (_, index) => getDiffLine(content, starts, index)), ['bare\rreturn']);
});

test('diff line index measures tabs from the visible lines', () => {
  const content = '\twide\nshort';
  const starts = indexDiffLines(content);

  assert.equal(measureDiffWidth(content, starts), 8);
});
