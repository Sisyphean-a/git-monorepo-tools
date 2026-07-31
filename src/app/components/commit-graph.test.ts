import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCommitGraph } from './commit-graph.js';
import type { CommitSummary } from '../domain/types.js';

function commit(hash: string, parentHashes: string[] = []): CommitSummary {
  return {
    hash,
    shortHash: hash,
    author: 'Test User',
    time: 'now',
    message: hash,
    additions: 0,
    deletions: 0,
    parents: parentHashes.length,
    parentHashes,
    refs: [],
    files: 0,
  };
}

test('buildCommitGraph keeps diverging branches on separate lanes', () => {
  const rows = buildCommitGraph([
    commit('main-head', ['main-base']),
    commit('feature-head', ['feature-base']),
    commit('feature-base', ['main-base']),
    commit('main-base', ['root']),
    commit('root'),
  ]);

  assert.deepEqual(rows.map(row => row.lane), [0, 1, 1, 0, 0]);
  assert.deepEqual(rows[1]?.parentLanes, [1]);
  assert.deepEqual(rows[2]?.parentLanes, [0]);
});

test('buildCommitGraph preserves lanes when later history pages are appended', () => {
  const firstPage = [
    commit('main-head', ['main-base']),
    commit('feature-head', ['feature-base']),
  ];
  const nextPage = [
    commit('feature-base', ['main-base']),
    commit('main-base', ['root']),
    commit('root'),
  ];

  const rows = buildCommitGraph([...firstPage, ...nextPage]);

  assert.equal(rows[2]?.lane, 1);
  assert.deepEqual(rows[2]?.parentLanes, [0]);
  assert.equal(rows[2]?.hasIncoming, true);
});

test('buildCommitGraph connects each merge parent without duplicating an existing lane', () => {
  const rows = buildCommitGraph([
    commit('merge', ['main', 'feature']),
    commit('feature', ['base']),
    commit('main', ['base']),
    commit('base'),
  ]);

  assert.deepEqual(rows[0]?.parentLanes, [0, 1]);
  assert.deepEqual(rows.map(row => row.lane), [0, 1, 0, 0]);
  assert.deepEqual(rows[2]?.parentLanes, [0]);
});
