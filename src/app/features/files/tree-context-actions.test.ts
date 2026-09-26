import assert from 'node:assert/strict';
import test from 'node:test';
import { treeEntryCopyValues } from './tree-context-actions.js';

test('file tree actions copy the clicked entry rather than the selected file', () => {
  assert.deepEqual(treeEntryCopyValues('C:\\work\\project', { name: 'main.ts', path: 'src/app/main.ts', isDir: false }), {
    name: 'main.ts',
    relativePath: 'src/app/main.ts',
    absolutePath: 'C:\\work\\project\\src\\app\\main.ts',
  });
  assert.deepEqual(treeEntryCopyValues('C:\\work\\project\\', { name: 'src', path: 'src', isDir: true }), {
    name: 'src', relativePath: 'src', absolutePath: 'C:\\work\\project\\src',
  });
});

test('absolute path preserves POSIX roots without duplicate separators', () => {
  assert.equal(treeEntryCopyValues('/work/project/', { name: 'x.txt', path: 'docs/x.txt', isDir: false }).absolutePath, '/work/project/docs/x.txt');
  assert.equal(treeEntryCopyValues('/', { name: 'x.txt', path: 'x.txt', isDir: false }).absolutePath, '/x.txt');
});
