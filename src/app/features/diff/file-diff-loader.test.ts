import test from 'node:test';
import assert from 'node:assert/strict';
import { createFileDiffLoader, fileDiffKey } from './file-diff-loader.js';
import type { FileChange, FileDiff } from '../../domain/types.js';

const file: FileChange = {
  id: 'file-1',
  status: 'M',
  path: 'src/app.ts',
  additions: 1,
  deletions: 0,
  size: '1 KB',
  staged: false,
};

const diff: FileDiff = {
  repoId: 'repo-1',
  path: file.path,
  staged: false,
  content: '+change',
};

test('file diff loader deduplicates concurrent requests and refetches after resolution', async () => {
  let calls = 0;
  const load = createFileDiffLoader(async () => {
    calls += 1;
    return diff;
  });

  const first = load.load(file);
  const second = load.load(file);
  assert.equal(first, second);
  assert.equal(await first, diff);
  assert.equal(await load.load(file), diff);
  assert.equal(calls, 2);
});

test('file diff loader separates staged and unstaged requests', async () => {
  let calls = 0;
  const load = createFileDiffLoader(async current => {
    calls += 1;
    return { ...diff, staged: current.staged };
  });

  await Promise.all([load.load(file), load.load({ ...file, staged: true })]);
  assert.equal(calls, 2);
});

test('unchanged snapshot objects keep the same semantic diff revision', () => {
  assert.equal(fileDiffKey({ ...file }), fileDiffKey(file));
  assert.notEqual(fileDiffKey({ ...file, additions: file.additions + 1 }), fileDiffKey(file));
});

test('file diff loader refetches after resolution without retaining a cache', async () => {
  let calls = 0;
  const load = createFileDiffLoader(async () => {
    calls += 1;
    return diff;
  });

  await load.load(file);
  await load.load({ ...file });
  assert.equal(calls, 2);
});

test('file diff loader retries after a failed request', async () => {
  let calls = 0;
  const load = createFileDiffLoader(async () => {
    calls += 1;
    if (calls === 1) throw new Error('failed');
    return diff;
  });

  await assert.rejects(load.load(file), /failed/);
  assert.equal(await load.load(file), diff);
  assert.equal(calls, 2);
});

test('separate loader generations isolate late results', async () => {
  let resolveOld: ((value: FileDiff) => void) | undefined;
  const oldLoader = createFileDiffLoader(() => new Promise(resolve => {
    resolveOld = resolve;
  }));
  const oldRequest = oldLoader.load(file);

  const currentDiff = { ...diff, content: '+current' };
  const currentLoader = createFileDiffLoader(async () => currentDiff);
  assert.equal(await currentLoader.load(file), currentDiff);

  resolveOld?.({ ...diff, content: '+old' });
  assert.equal((await oldRequest).content, '+old');
  assert.equal(await currentLoader.load(file), currentDiff);
});
