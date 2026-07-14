import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeRepoSnapshotUpdate } from './repo-snapshot-merge.js';
import { mergeSidebarRepoUpdate } from './sidebar-snapshot.js';
import type { AppSnapshot, RepoDetail, RepoSnapshotUpdate } from './types.js';

function repo(id: string, modified: number, path = `/repo/${id}`): RepoDetail {
  return {
    id,
    name: id,
    branch: 'main',
    path,
    remote: 'origin',
    category: '测试',
    modified,
    ahead: 0,
    behind: 0,
    conflicts: 0,
    status: modified > 0 ? 'changed' : 'clean',
    lastScan: 'old',
    files: [],
    stagedCount: 0,
    unstagedCount: modified,
    scannedAt: 'old',
    history: [],
    historyTotal: 0,
    historyHasMore: false,
  };
}

test('mergeRepoSnapshotUpdate replaces only target repo fields and candidates', () => {
  const snapshot: AppSnapshot = {
    scannedAt: 'old-scan',
    categories: ['测试'],
    repos: [repo('repo-a', 0), repo('repo-b', 1)],
    repoDetails: {
      'repo-a': repo('repo-a', 0),
      'repo-b': repo('repo-b', 1),
    },
    selectedRepoId: 'repo-a',
    pullResults: [],
    commitCandidates: {
      'repo-a': [],
      'repo-b': [{ id: 'old', style: '', icon: '', title: '', body: '', full: '' }],
    },
  };
  const update: RepoSnapshotUpdate = {
    repo: {
      ...repo('repo-b', 3),
      lastScan: 'new',
      scannedAt: 'new',
      stagedCount: 1,
      files: [{ id: 'a', status: 'M', path: 'a.txt', additions: 1, deletions: 0, size: '1 KB', staged: true }],
    },
    commitCandidates: [{ id: 'new', style: '', icon: '', title: '', body: '', full: '' }],
    scannedAt: 'merged-scan',
  };

  const next = mergeRepoSnapshotUpdate(snapshot, update);

  assert.equal(next.scannedAt, 'merged-scan');
  assert.equal(next.repoDetails['repo-b'].modified, 3);
  assert.equal(next.repoDetails['repo-a'].modified, 0);
  assert.equal(next.commitCandidates['repo-b'][0]?.id, 'new');
  assert.deepEqual(next.repos.map(item => item.id), ['repo-a', 'repo-b']);
});

test('mergeSidebarRepoUpdate updates only sidebar summary fields', () => {
  const update: RepoSnapshotUpdate = {
    repo: {
      ...repo('repo-b', 4),
      lastScan: 'new',
      scannedAt: 'new',
    },
    commitCandidates: [],
    scannedAt: 'sidebar-scan',
  };

  const next = mergeSidebarRepoUpdate({
    scannedAt: 'old-scan',
    categories: ['测试'],
    repos: [repo('repo-a', 0), repo('repo-b', 1)],
  }, update);

  assert.equal(next.scannedAt, 'sidebar-scan');
  assert.equal(next.repos[1]?.id, 'repo-b');
  assert.equal(next.repos[1]?.modified, 4);
  assert.deepEqual(next.categories, ['测试']);
});

test('mergeRepoSnapshotUpdate keeps sidebar order stable when repo status changes', () => {
  const snapshot: AppSnapshot = {
    scannedAt: 'old-scan',
    categories: ['测试'],
    repos: [repo('repo-a', 0), repo('repo-b', 1), repo('repo-c', 0)],
    repoDetails: {
      'repo-a': repo('repo-a', 0),
      'repo-b': repo('repo-b', 1),
      'repo-c': repo('repo-c', 0),
    },
    selectedRepoId: 'repo-a',
    pullResults: [],
    commitCandidates: {
      'repo-a': [],
      'repo-b': [],
      'repo-c': [],
    },
  };

  const next = mergeRepoSnapshotUpdate(snapshot, {
    repo: {
      ...repo('repo-c', 8),
      lastScan: 'new',
      scannedAt: 'new',
    },
    commitCandidates: [],
    scannedAt: 'new-scan',
  });

  assert.deepEqual(next.repos.map(item => item.id), ['repo-a', 'repo-b', 'repo-c']);
  assert.equal(next.repos[2]?.modified, 8);
});
