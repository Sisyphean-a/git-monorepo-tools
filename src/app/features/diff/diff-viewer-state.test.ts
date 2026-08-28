import test from 'node:test';
import assert from 'node:assert/strict';
import type { FileChange } from '../../domain/types.js';
import { chooseDefaultWorkingDiffMode, filterWorkingDiffFiles } from './diff-viewer-state.js';

const staged: FileChange = { id: 'staged', status: 'M', path: 'staged.ts', additions: 1, deletions: 0, size: '1 KB', staged: true };
const unstaged: FileChange = { id: 'unstaged', status: 'M', path: 'unstaged.ts', additions: 1, deletions: 0, size: '1 KB', staged: false };
const untracked: FileChange = { id: 'untracked', status: 'A', path: 'new.ts', additions: 1, deletions: 0, size: '1 KB', staged: false, untracked: true };

test('working diff mode excludes untracked files', () => {
  assert.deepEqual(filterWorkingDiffFiles([staged, unstaged, untracked], 'staged'), [staged]);
  assert.deepEqual(filterWorkingDiffFiles([staged, unstaged, untracked], 'unstaged'), [unstaged]);
});

test('working diff mode defaults to the only populated source and unstaged when both exist', () => {
  assert.equal(chooseDefaultWorkingDiffMode([staged]), 'staged');
  assert.equal(chooseDefaultWorkingDiffMode([unstaged]), 'unstaged');
  assert.equal(chooseDefaultWorkingDiffMode([staged, unstaged]), 'unstaged');
  assert.equal(chooseDefaultWorkingDiffMode([untracked]), 'unstaged');
});
