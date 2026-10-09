import test from 'node:test';
import assert from 'node:assert/strict';
import { createRepoActions } from './use-repo-actions.js';
import { describeRepoActionError } from './repo-action-error.js';
import type { WorkspaceBackend } from './ports.js';
import type { RepoMutationAction, RepoSnapshotUpdate } from '../domain/types.js';
import { DEFAULT_SETTINGS } from '../infrastructure/settings-store.js';

const repo = { name: 'repo', path: 'E:/repo' };
function fixture(backend: Partial<WorkspaceBackend>, applyRepoUpdate = (_: RepoSnapshotUpdate) => {}) {
  return createRepoActions({
    backend: backend as WorkspaceBackend,
    settings: DEFAULT_SETTINGS,
    snapshot: null,
    runQueuedTask: async (task, onSuccess, options) => { assert.equal(options?.reportErrors, false); const result = await task(); onSuccess?.(result); return result; },
    applyRepoUpdate,
    setActionError: () => {}, setRepoLog: () => {}, reportActionError: () => {},
  });
}

test('all Git mutations propagate Wails string errors without losing operation context', async () => {
  for (const action of ['stage-all', 'unstage-all', 'stage-file', 'unstage-file', 'commit', 'pull', 'push', 'discard-all'] as RepoMutationAction[]) {
    const detail = `rejection for ${action}\nfull Git output`;
    let applied = false;
    const actions = fixture({ mutateRepo: async (_, actualAction) => { assert.equal(actualAction, action); throw detail; } }, () => { applied = true; });
    await assert.rejects(actions.mutateRepo('repo-id', action), error => {
      assert.equal(error, detail);
      assert.equal(describeRepoActionError(action, error, repo).detail, detail);
      return true;
    });
    assert.equal(applied, false);
  }
});

test('refresh applies a scan failure snapshot but explicitly reports the error', async () => {
  const update = { repo: { scanError: 'permission denied' } } as RepoSnapshotUpdate;
  const applied: RepoSnapshotUpdate[] = [];
  const actions = fixture({ refreshRepo: async () => update }, result => applied.push(result));
  await assert.rejects(actions.refreshWorkspace('repo-id'), /仓库扫描失败：\npermission denied/);
  assert.deepEqual(applied, [update]);
});

test('mutation followed by a failed status read must not claim the mutation was undone', async () => {
  const update = { repo: { scanError: 'status timeout' } } as RepoSnapshotUpdate;
  const applied: RepoSnapshotUpdate[] = [];
  const actions = fixture({ mutateRepo: async () => update }, result => applied.push(result));
  await assert.rejects(actions.mutateRepo('repo-id', 'commit'), error => {
    const failure = describeRepoActionError('commit', error, repo);
    assert.equal(failure.kind, 'refresh-after-success');
    assert.match(failure.suggestion, /不要直接重复提交/);
    return true;
  });
  assert.deepEqual(applied, [update]);
});

test('successful mutation and refresh still return their applied snapshots', async () => {
  const update = { repo: { scanError: '' } } as RepoSnapshotUpdate;
  const applied: RepoSnapshotUpdate[] = [];
  const actions = fixture({ mutateRepo: async () => update, refreshRepo: async () => update }, result => applied.push(result));
  assert.equal(await actions.mutateRepo('repo-id', 'pull'), update);
  assert.equal(await actions.refreshWorkspace('repo-id'), update);
  assert.deepEqual(applied, [update, update]);
});
