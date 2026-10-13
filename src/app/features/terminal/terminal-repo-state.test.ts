import test from 'node:test';
import assert from 'node:assert/strict';
import { collectEmptyTerminalClosures, retainExistingRepoIds, retainExistingRepoIdSet } from './terminal-repo-state.js';

const repos = { 'repo-a': true, 'repo-b': true };

test('immediately closes empty terminals when switching tabs or repositories', () => {
  const opened = ['repo-a', 'repo-b'];
  const contentful = new Set(['repo-b']);
  assert.deepEqual([...collectEmptyTerminalClosures(opened, 'repo-a', false, contentful, new Set())], ['repo-a']);
  assert.deepEqual([...collectEmptyTerminalClosures(opened, 'repo-b', true, contentful, new Set())], ['repo-a']);
  assert.deepEqual([...collectEmptyTerminalClosures(opened, 'repo-a', true, contentful, new Set())], []);
});

test('retains closure requests until completion even if the user returns immediately', () => {
  const closing = collectEmptyTerminalClosures(['repo-a'], 'repo-a', false, new Set(), new Set());
  assert.equal(collectEmptyTerminalClosures(['repo-a'], 'repo-a', true, new Set(), closing), closing);
  assert.equal(collectEmptyTerminalClosures(['repo-a'], 'repo-b', true, new Set(), closing), closing);
});

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
