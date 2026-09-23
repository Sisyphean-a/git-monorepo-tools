import test from 'node:test';
import assert from 'node:assert/strict';
import { findFileMatches, type FileSearchOptions } from './file-search.js';

const defaults: FileSearchOptions = {
  caseSensitive: false,
  wholeWord: false,
  useRegex: false,
};

test('literal search finds every non-overlapping match without case sensitivity by default', () => {
  assert.deepEqual(findFileMatches('Alpha alpha alphabet', 'alpha', defaults), {
    matches: [
      { start: 0, end: 5 },
      { start: 6, end: 11 },
      { start: 12, end: 17 },
    ],
    error: null,
  });
  assert.deepEqual(findFileMatches('a+b aab', 'a+b', defaults).matches, [{ start: 0, end: 3 }]);
});

test('case-sensitive and whole-word modes narrow literal results', () => {
  assert.deepEqual(findFileMatches('Alpha alpha alphabet', 'alpha', { ...defaults, caseSensitive: true, wholeWord: true }).matches, [
    { start: 6, end: 11 },
  ]);
  assert.deepEqual(findFileMatches('中文 中文词 中文', '中文', { ...defaults, wholeWord: true }).matches, [
    { start: 0, end: 2 },
    { start: 7, end: 9 },
  ]);
});

test('regex mode supports line anchors and reports invalid expressions', () => {
  assert.deepEqual(findFileMatches('one\ntwo\nthree', '^t\\w+', { ...defaults, useRegex: true }).matches, [
    { start: 4, end: 7 },
    { start: 8, end: 13 },
  ]);
  assert.equal(findFileMatches('text', '[', { ...defaults, useRegex: true }).error, '正则表达式无效');
});

test('zero-width regex matches advance safely across Unicode text', () => {
  assert.deepEqual(findFileMatches('😀a', '^|$', { ...defaults, useRegex: true }).matches, [
    { start: 0, end: 0 },
    { start: 3, end: 3 },
  ]);
});
