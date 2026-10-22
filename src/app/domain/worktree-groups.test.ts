import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateWorktreeGroupStatus,
  favoriteWorktreeGroups,
  filterWorktreeGroups,
  groupReposByWorktree,
  isWorktreeGroupFavorite,
  nonFavoriteWorktreeGroups,
  worktreeGroupConflicts,
  worktreeGroupHasRemoteError,
  worktreeGroupModified,
} from './worktree-groups.js';
import type { Repo } from './types.js';

function createRepo(id: string, overrides: Partial<Repo> = {}): Repo {
  return {
    id,
    name: id,
    branch: 'main',
    path: `E:/repos/${id}`,
    remote: 'origin',
    category: '默认工作区',
    modified: 0,
    ahead: 0,
    behind: 0,
    conflicts: 0,
    status: 'clean',
    lastScan: '2026-03-31 10:00:00',
    ...overrides,
  };
}

function createWorktreeRepos() {
  const main = createRepo('main', {
    name: 'my-repo',
    path: 'E:/repos/my-repo',
    worktreeGroupId: 'wt-1',
    worktreeGroupName: 'my-repo',
    isMainWorktree: true,
  });
  const linked = createRepo('feat-x', {
    name: 'feat-x',
    branch: 'feat/x',
    path: 'E:/repos/feat-x',
    worktreeGroupId: 'wt-1',
    worktreeGroupName: 'my-repo',
    isMainWorktree: false,
    modified: 2,
    status: 'changed',
  });
  const other = createRepo('other', { name: 'other', path: 'E:/repos/other' });
  return { main, linked, other };
}

test('groups linked worktrees under one repository with the main worktree first', () => {
  const { main, linked, other } = createWorktreeRepos();
  const groups = groupReposByWorktree([other, linked, main]);

  assert.deepEqual(groups.map(group => group.name), ['my-repo', 'other']);
  const group = groups[0];
  assert.ok(group);
  assert.equal(group.id, 'wt-1');
  assert.equal(group.representativeId, 'main');
  assert.equal(group.total, 2);
  assert.deepEqual(group.repos.map(repo => repo.id), ['main', 'feat-x']);
});

test('repos without worktree metadata stay independent single-worktree groups', () => {
  const groups = groupReposByWorktree([createRepo('repo-a'), createRepo('repo-b')]);

  assert.deepEqual(groups.map(group => group.id), ['repo-a', 'repo-b']);
  assert.ok(groups.every(group => group.total === 1 && group.representativeId === group.repos[0]?.id));
});

test('worktree group name falls back to backend group name when the main worktree is not scanned', () => {
  const onlyLinked = createRepo('feat-x', {
    name: 'feat-x',
    path: 'E:/repos/feat-x',
    worktreeGroupId: 'wt-2',
    worktreeGroupName: 'my-repo',
    isMainWorktree: false,
  });

  const groups = groupReposByWorktree([onlyLinked]);

  assert.equal(groups[0]?.name, 'my-repo');
  assert.equal(groups[0]?.representativeId, 'feat-x');
});

test('search matches a group name for all worktrees and a child for only that worktree', () => {
  const { main, linked, other } = createWorktreeRepos();
  const groups = groupReposByWorktree([main, linked, other]);

  const groupMatch = filterWorktreeGroups(groups, 'my-repo');
  assert.equal(groupMatch.length, 1);
  assert.deepEqual(groupMatch[0]?.repos.map(repo => repo.id), ['main', 'feat-x']);
  assert.equal(groupMatch[0]?.total, 2);

  const childMatch = filterWorktreeGroups(groups, 'feat');
  assert.equal(childMatch.length, 1);
  assert.deepEqual(childMatch[0]?.repos.map(repo => repo.id), ['feat-x']);
  assert.equal(childMatch[0]?.total, 2);

  const branchMatch = filterWorktreeGroups(groups, 'feat/x');
  assert.deepEqual(branchMatch[0]?.repos.map(repo => repo.id), ['feat-x']);
});

test('favorites are ordered by first favorite member and are not repeated across sections', () => {
  const { main, linked, other } = createWorktreeRepos();
  const groups = groupReposByWorktree([main, linked, other]);

  const favorites = favoriteWorktreeGroups(groups, ['feat-x', 'main', 'other', 'removed']);
  assert.deepEqual(favorites.map(group => group.id), ['wt-1', 'other']);
  assert.deepEqual(nonFavoriteWorktreeGroups(groups, ['feat-x']).map(group => group.id), ['other']);
  assert.equal(isWorktreeGroupFavorite(groups[0]!, ['repos/feat-x']), false);
  assert.equal(isWorktreeGroupFavorite(groups[0]!, ['feat-x']), true);
});

test('group status rolls up the worst local state and sums visible counters', () => {
  const { main, linked } = createWorktreeRepos();
  linked.status = 'checking';
  assert.equal(aggregateWorktreeGroupStatus([main, linked]), 'checking');
  linked.status = 'error';
  assert.equal(aggregateWorktreeGroupStatus([main, linked]), 'error');
  linked.status = 'conflict';
  linked.conflicts = 3;
  assert.equal(aggregateWorktreeGroupStatus([main, linked]), 'conflict');
  assert.equal(worktreeGroupConflicts([main, linked]), 3);
  assert.equal(worktreeGroupModified([main, linked]), 2);
});

test('group status surfaces remote failures and unknown remotes separately', () => {
  const { main, linked } = createWorktreeRepos();
  assert.equal(worktreeGroupHasRemoteError([main, linked]), false);
  linked.remoteCheck = { status: 'error', checkedAt: '2026-03-31 10:01:00', error: 'timeout' };
  assert.equal(worktreeGroupHasRemoteError([main, linked]), true);
});
