import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspaceSnapshotState } from './workspace-snapshot-state.js';
import { createSnapshotCoordinator } from './snapshot-coordinator.js';
import { DEFAULT_SETTINGS } from '../infrastructure/settings-store.js';
import type { AppSnapshot, RepoDetail } from '../domain/types.js';

function repo(id: string, modified = 0): RepoDetail {
  return {
    id, name: id, branch: 'main', path: `E:/${id}`, remote: 'origin', category: 'test',
    modified, ahead: 0, behind: 0, conflicts: 0, status: modified ? 'changed' : 'clean', lastScan: 'old',
    files: [], stagedCount: 0, unstagedCount: modified, scannedAt: 'old', history: [], historyTotal: 0, historyHasMore: false,
  };
}

function snapshot(...repos: RepoDetail[]): AppSnapshot {
  return { scannedAt: 'scan', categories: ['test'], repos, repoDetails: Object.fromEntries(repos.map(item => [item.id, item])), selectedRepoId: repos[0]?.id ?? '', pullResults: [] };
}

test('complete snapshots change membership while keeping interactions newer than their read baseline', () => {
  const state = createWorkspaceSnapshotState();
  state.applySnapshot(snapshot(repo('a'), repo('removed')));
  const context = { preserveInteractionsSince: state.readRepoUpdateRevision() };
  state.applyInteraction({ repo: repo('a', 4), scannedAt: 'interaction' });
  const next = state.applySnapshot({ ...snapshot(repo('a', 1), repo('added')), scannedAt: 'new-scan' }, context);
  assert.deepEqual(next.repos.map(item => item.id), ['a', 'added']);
  assert.equal(next.repoDetails.a?.modified, 4);
  assert.equal(next.repoDetails.a?.historyRevision, 'interaction-1');
  assert.equal(next.repoDetails.removed, undefined);
  assert.equal(next.scannedAt, 'new-scan');
});

test('late background updates are rejected per repository, not by a global interaction count', () => {
  const state = createWorkspaceSnapshotState();
  state.applySnapshot(snapshot(repo('a'), repo('b')));
  const context = { preserveInteractionsSince: state.readRepoUpdateRevision() };
  state.applyInteraction({ repo: repo('a', 3), scannedAt: 'new' });
  const before = state.readSnapshot();
  assert.equal(state.applyBackground({ repo: repo('a', 1), scannedAt: 'late' }, context), undefined);
  assert.equal(state.readSnapshot(), before);
  const applied = state.applyBackground({ repo: repo('b', 2), scannedAt: 'late' }, context);
  assert.equal(applied?.repoDetails.b?.modified, 2);
  assert.equal(applied?.scannedAt, 'scan');
  assert.equal(state.readRepoUpdateRevision(), 1);
  state.applySnapshot(snapshot(repo('b')));
  assert.equal(state.applyBackground({ repo: repo('a'), scannedAt: 'late' }), undefined);
});

test('background updates preserve reading data, file identities and remote feedback through the public state', () => {
  const state = createWorkspaceSnapshotState();
  const current = repo('a');
  current.files = [{ id: 'f', path: 'a.txt', status: 'M', staged: false, additions: 1, deletions: 0, size: '1 B' }];
  current.historyTotal = 5;
  current.historyRevision = 'reading';
  current.remoteCheck = { status: 'error', checkedAt: 'old', error: 'Fetch failed' };
  state.applySnapshot(snapshot(current));
  const applied = state.applyBackground({ repo: { ...repo('a'), files: current.files.map(file => ({ ...file })) }, scannedAt: 'poll' });
  assert.equal(applied?.repoDetails.a?.files, current.files);
  assert.equal(applied?.repoDetails.a?.history, current.history);
  assert.equal(applied?.repoDetails.a?.historyTotal, 5);
  assert.equal(applied?.repoDetails.a?.historyRevision, 'reading');
  assert.equal(applied?.repoDetails.a?.remoteCheck, current.remoteCheck);
});

test('interactions before bootstrap still advance the version and unguarded snapshots replace state', () => {
  const state = createWorkspaceSnapshotState();
  assert.equal(state.applyBackground({ repo: repo('a'), scannedAt: '' }), undefined);
  assert.equal(state.applyInteraction({ repo: repo('a'), scannedAt: '' }), null);
  assert.equal(state.readRepoUpdateRevision(), 1);
  state.applySnapshot(snapshot(repo('a')));
  state.applyInteraction({ repo: repo('a', 4), scannedAt: '' });
  const next = snapshot(repo('a', 1));
  assert.equal(state.applySnapshot(next), next);
  assert.equal(state.readSnapshot(), next);
  assert.equal(state.readRepoUpdateRevision(), 2);
});

test('coordinator and state use the same write baseline when a complete read crosses an interaction', async () => {
  const state = createWorkspaceSnapshotState();
  state.applySnapshot(snapshot(repo('a')));
  let finish!: (result: AppSnapshot) => void;
  const pending = new Promise<AppSnapshot>(resolve => { finish = resolve; });
  const coordinator = createSnapshotCoordinator({
    fetchSnapshot: () => pending,
    refreshRepo: async () => { throw new Error('unexpected remote read'); },
    applySnapshot: state.applySnapshot,
    applyRepoUpdate: state.applyBackground,
    readRepoUpdateRevision: state.readRepoUpdateRevision,
  });
  const refresh = coordinator.requestRefresh(DEFAULT_SETTINGS, { refreshRemotes: false });
  await coordinator.runTask(async () => ({ repo: repo('a', 6), scannedAt: 'interaction' }), state.applyInteraction);
  finish(snapshot(repo('a', 1), repo('added')));
  await refresh;
  assert.equal(state.readSnapshot()?.repoDetails.a?.modified, 6);
  assert.deepEqual(state.readSnapshot()?.repos.map(item => item.id), ['a', 'added']);
});
