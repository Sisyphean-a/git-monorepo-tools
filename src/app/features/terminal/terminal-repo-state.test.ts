import test from 'node:test';
import assert from 'node:assert/strict';
import { retainExistingRepoIds, retainExistingRepoIdSet } from './terminal-repo-state.js';

const repos = { 'repo-a': true, 'repo-b': true };

test('keeps terminal state references when periodic refresh retains every repository', () => {
  const openedRepoIds = ['repo-a', 'repo-b'];
  const contentfulRepoIds = new Set(['repo-a']);

  assert.equal(retainExistingRepoIds(openedRepoIds, repos), openedRepoIds);
  assert.equal(retainExistingRepoIdSet(contentfulRepoIds, repos), contentfulRepoIds);
});

test('removes terminal state for a repository that is no longer present', () => {
  const openedRepoIds = ['repo-a', 'repo-b'];
  const contentfulRepoIds = new Set(['repo-a', 'repo-b']);
  const remainingRepos = { 'repo-a': true };

  assert.deepEqual(retainExistingRepoIds(openedRepoIds, remainingRepos), ['repo-a']);
  assert.deepEqual([...retainExistingRepoIdSet(contentfulRepoIds, remainingRepos)], ['repo-a']);
});
