import test from 'node:test';
import assert from 'node:assert/strict';
import { countWrappedLineRows, filterSideBySideDisplayRows, measureSideBySideWidth, parseSideBySideDiff } from './side-by-side.js';

test('side-by-side parser pairs deleted and added lines with line numbers', () => {
  const rows = parseSideBySideDiff([
    'diff --git a/file.txt b/file.txt',
    '--- a/file.txt',
    '+++ b/file.txt',
    '@@ -1,3 +1,3 @@',
    ' keep',
    '-old',
    '+new',
    ' after',
  ].join('\n'));

  assert.deepEqual(rows, [
    { kind: 'meta', text: 'diff --git a/file.txt b/file.txt' },
    { kind: 'meta', text: '--- a/file.txt' },
    { kind: 'meta', text: '+++ b/file.txt' },
    { kind: 'hunk', text: '@@ -1,3 +1,3 @@' },
    {
      kind: 'lines',
      left: { lineNumber: 1, text: 'keep', kind: 'context' },
      right: { lineNumber: 1, text: 'keep', kind: 'context' },
    },
    {
      kind: 'lines',
      left: { lineNumber: 2, text: 'old', kind: 'deleted' },
      right: { lineNumber: 2, text: 'new', kind: 'added' },
    },
    {
      kind: 'lines',
      left: { lineNumber: 3, text: 'after', kind: 'context' },
      right: { lineNumber: 3, text: 'after', kind: 'context' },
    },
  ]);
});

test('side-by-side parser keeps unpaired additions, metadata, and CRLF lines', () => {
  const rows = parseSideBySideDiff('@@ -0,0 +1,2 @@\r\n+first\r\n+second\r\n\\ No newline at end of file');

  assert.deepEqual(rows, [
    { kind: 'hunk', text: '@@ -0,0 +1,2 @@' },
    { kind: 'lines', left: { lineNumber: null, text: '', kind: 'empty' }, right: { lineNumber: 1, text: 'first', kind: 'added' } },
    { kind: 'lines', left: { lineNumber: null, text: '', kind: 'empty' }, right: { lineNumber: 2, text: 'second', kind: 'added' } },
    { kind: 'meta', text: '\\ No newline at end of file' },
  ]);
});

test('display rows omit diff metadata and hunk headers', () => {
  const rows = filterSideBySideDisplayRows(parseSideBySideDiff([
    'diff --git a/file.txt b/file.txt',
    'index 123..456 100644',
    '--- a/file.txt',
    '+++ b/file.txt',
    '@@ -1 +1 @@',
    '-old',
    '+new',
  ].join('\n')));

  assert.deepEqual(rows, [
    {
      kind: 'lines',
      left: { lineNumber: 1, text: 'old', kind: 'deleted' },
      right: { lineNumber: 1, text: 'new', kind: 'added' },
    },
  ]);
});

test('wrapped line rows account for tabs and long text', () => {
  assert.equal(countWrappedLineRows('123456789', 4), 3);
  assert.equal(countWrappedLineRows('\t1234', 4), 2);
  assert.equal(countWrappedLineRows('', 4), 1);
});

test('side-by-side width measures tabs on each side', () => {
  const rows = parseSideBySideDiff('@@ -1 +1 @@\n-\told\n+new');

  assert.deepEqual(measureSideBySideWidth(rows), { left: 7, right: 3 });
});
