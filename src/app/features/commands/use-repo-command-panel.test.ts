import test from 'node:test';
import assert from 'node:assert/strict';
import { runRepoPanelAction } from './use-repo-command-panel.js';
import type { RepoActionFailure } from '../../application/repo-action-error.js';

test('all right-hand actions clear old feedback then retain complete failures with operation identity', async () => {
  for (const action of ['stage-all', 'unstage-all', 'generate', 'commit', 'pull', 'push', 'refresh', 'discard-all']) {
    const busy: (string | null)[] = [];
    const errors: (RepoActionFailure | null)[] = [];
    await runRepoPanelAction(action, async () => { throw 'Wails rejection\nfile.ts'; }, {
      repo: { name: 'repo', path: 'E:/repo' }, isActive: () => true,
      setBusyAction: value => busy.push(value), setError: value => errors.push(value),
    });
    assert.deepEqual(busy, [action, null]);
    assert.equal(errors[0], null);
    assert.equal(errors[1]?.detail, 'Wails rejection\nfile.ts');
    assert.match(errors[1]?.title ?? '', /失败/);
  }
});

test('failure after switching repositories is stored only for the originating repo and cannot clear new busy state', async () => {
  let active = true;
  let reject!: (error: unknown) => void;
  const task = new Promise<void>((_, fail) => { reject = fail; });
  const busy: Record<string, string | null> = { B: 'push' };
  const errors: Record<string, RepoActionFailure | null> = { B: null };
  const pending = runRepoPanelAction('pull', () => task, {
    repo: { name: 'repo A', path: 'E:/A' }, isActive: () => active,
    setBusyAction: value => { busy.A = value; }, setError: value => { errors.A = value; },
  });
  active = false;
  assert.equal(busy.A, 'pull');
  reject('当前仓库有本地改动：A/file.ts');
  await pending;
  assert.deepEqual(busy, { A: null, B: 'push' });
  assert.equal(errors.B, null);
  assert.equal(errors.A?.repoName, 'repo A');
  assert.equal(errors.A?.kind, 'local-changes');
  assert.match(errors.A?.detail ?? '', /A\/file.ts/);
});

test('a successful later action clears the previous error and resets activity', async () => {
  const errors: (RepoActionFailure | null)[] = [];
  const busy: (string | null)[] = [];
  await runRepoPanelAction('refresh', async () => {}, {
    repo: { name: 'repo', path: 'E:/repo' }, isActive: () => true,
    setBusyAction: value => busy.push(value), setError: value => errors.push(value),
  });
  assert.deepEqual(errors, [null]);
  assert.deepEqual(busy, ['refresh', null]);
});
