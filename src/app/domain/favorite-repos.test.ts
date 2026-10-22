import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultRepoId, favoriteRepos, toggleFavoriteRepoIds } from './favorite-repos.js';
import type { Repo } from './types.js';

function createRepo(id: string): Repo {
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
  };
}

test('favorite repos are ordered by the saved favorites', () => {
  const repos = [createRepo('repo-a'), createRepo('repo-b'), createRepo('repo-c')];
  const favoriteRepoIds = ['repo-c', 'repo-a', 'removed-repo'];

  assert.deepEqual(favoriteRepos(repos, favoriteRepoIds).map(repo => repo.id), ['repo-c', 'repo-a']);
});

test('defaultRepoId uses the first available favorite and otherwise falls back', () => {
  const repos = [createRepo('repo-a'), createRepo('repo-b')];

  assert.equal(defaultRepoId(repos, ['removed-repo', 'repo-b'], 'repo-a'), 'repo-b');
  assert.equal(defaultRepoId(repos, ['removed-repo'], 'repo-a'), 'repo-a');
});

test('group favorite toggling adds all members or removes the whole group', () => {
  assert.deepEqual(toggleFavoriteRepoIds([], ['main', 'feat-x']), ['main', 'feat-x']);
  assert.deepEqual(toggleFavoriteRepoIds(['other'], ['main', 'feat-x']), ['other', 'main', 'feat-x']);
  assert.deepEqual(toggleFavoriteRepoIds(['main', 'feat-x', 'other'], ['main', 'feat-x']), ['other']);
  assert.deepEqual(toggleFavoriteRepoIds(['other'], []), ['other']);
});
