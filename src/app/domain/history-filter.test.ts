import test from 'node:test';
import assert from 'node:assert/strict';
import { groupRepoRefs, historyScopeLabel, pruneHistoryRefs } from './history-filter.js';
import type { RepoRef } from './types.js';

function ref(name: string, kind: RepoRef['kind'], current = false): RepoRef {
  return { name, shortName: name.replace(/^refs\/(heads|remotes|tags)\//, ''), kind, hash: name, current };
}

test('groups local, remote and tag refs with the current branch first', () => {
  const groups = groupRepoRefs([
    ref('refs/tags/v1', 'tag'),
    ref('refs/remotes/origin/main', 'remote'),
    ref('refs/heads/main', 'branch', true),
    ref('refs/heads/feature', 'branch'),
  ]);
  const branches = groups.find(group => group.kind === 'branch');

  assert.deepEqual(groups.map(group => group.label), ['本地分支', '远端分支', '标签']);
  assert.deepEqual(branches?.refs.map(item => item.shortName), ['main', 'feature']);
  assert.deepEqual(groups.find(group => group.kind === 'remote')?.refs.map(item => item.shortName), ['origin/main']);
});

test('labels the history scope from the active selection', () => {
  const refs = [ref('refs/heads/main', 'branch'), ref('refs/heads/feat/x', 'branch')];

  assert.equal(historyScopeLabel('all', [], refs), '全部分支');
  assert.equal(historyScopeLabel('head', [], refs), '当前分支');
  assert.equal(historyScopeLabel('selected', ['refs/heads/feat/x'], refs), 'feat/x');
  assert.equal(historyScopeLabel('selected', ['refs/heads/main', 'refs/heads/feat/x'], refs), '已选 2 个分支');
});

test('prunes selected refs that disappeared from the repository', () => {
  const refs = [ref('refs/heads/main', 'branch'), ref('refs/heads/feat/x', 'branch')];

  assert.deepEqual(pruneHistoryRefs(refs, ['refs/heads/feat/x', 'refs/heads/removed']), ['refs/heads/feat/x']);
});
