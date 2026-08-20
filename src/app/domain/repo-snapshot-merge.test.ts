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
  const repoA = next.repoDetails['repo-a'];
  const repoB = next.repoDetails['repo-b'];
  const repoBCandidates = next.commitCandidates['repo-b'];
  assert.ok(repoA);
  assert.ok(repoB);
  assert.ok(repoBCandidates);

  assert.equal(next.scannedAt, 'merged-scan');
  assert.equal(repoB.modified, 3);
  assert.equal(repoA.modified, 0);
  assert.equal(repoBCandidates[0]?.id, 'new');
  assert.deepEqual(next.repos.map(item => item.id), ['repo-a', 'repo-b']);
});

test('mergeRepoSnapshotUpdate preserves reading data and stable file identities', () => {
  const current = repo('repo-a', 1);
  current.files = [{ id: 'a', status: 'M', path: 'a.txt', additions: 1, deletions: 0, size: '1 KB', staged: false }];
  current.history = [{ hash: 'abc', shortHash: 'abc', author: 'A', time: 'now', message: 'keep', additions: 1, deletions: 0, parents: 1, parentHashes: [], refs: [], files: 1 }];
  current.historyTotal = 1;
  const snapshot: AppSnapshot = {
    scannedAt: 'old', categories: [], repos: [current], repoDetails: { 'repo-a': current }, selectedRepoId: 'repo-a', pullResults: [], commitCandidates: { 'repo-a': [] },
  };

  const next = mergeRepoSnapshotUpdate(snapshot, {
    repo: { ...repo('repo-a', 1), scannedAt: 'new', files: current.files.map(file => ({ ...file })) },
    commitCandidates: [],
    scannedAt: 'new',
  }, 'background');

  assert.equal(next.repoDetails['repo-a']?.history[0]?.hash, 'abc');
  assert.equal(next.repoDetails['repo-a']?.historyTotal, 1);
  assert.equal(next.repoDetails['repo-a']?.files, current.files);
  assert.equal(next.repoDetails['repo-a']?.files[0], current.files[0]);
});

test('background HEAD changes invalidate history without an app interaction', () => {
  const current = repo('repo-a', 0);
  current.headRevision = 'old-head';
  current.history = [{ hash: 'old-head', shortHash: 'old', author: 'A', time: 'now', message: 'old', additions: 0, deletions: 0, parents: 1, parentHashes: [], refs: [], files: 0 }];
  current.historyRevision = 'head-old-head';
  const snapshot: AppSnapshot = {
    scannedAt: 'old', categories: [], repos: [current], repoDetails: { 'repo-a': current }, selectedRepoId: 'repo-a', pullResults: [], commitCandidates: { 'repo-a': [] },
  };

  const next = mergeRepoSnapshotUpdate(snapshot, {
    repo: { ...repo('repo-a', 0), headRevision: 'new-head' },
    commitCandidates: [],
    scannedAt: 'background',
  }, 'background');

  assert.deepEqual(next.repoDetails['repo-a']?.history, []);
  assert.equal(next.repoDetails['repo-a']?.historyRevision, 'head-new-head');
});

test('interaction updates invalidate history reading data', () => {
  const current = repo('repo-a', 0);
  current.history = [{ hash: 'abc', shortHash: 'abc', author: 'A', time: 'now', message: 'old', additions: 0, deletions: 0, parents: 1, parentHashes: [], refs: [], files: 0 }];
  current.historyTotal = 1;
  current.historyRevision = 'old';
  const snapshot: AppSnapshot = {
    scannedAt: 'old', categories: [], repos: [current], repoDetails: { 'repo-a': current }, selectedRepoId: 'repo-a', pullResults: [], commitCandidates: { 'repo-a': [] },
  };

  const next = mergeRepoSnapshotUpdate(snapshot, {
    repo: repo('repo-a', 0),
    commitCandidates: [],
    scannedAt: 'same-second',
  }, 'interaction', 'interaction-2');

  assert.deepEqual(next.repoDetails['repo-a']?.history, []);
  assert.equal(next.repoDetails['repo-a']?.historyRevision, 'interaction-2');
});

test('mergeRepoSnapshotUpdate replaces changed file summaries',  () => {
  const current = repo('repo-a', 1);
  current.files = [{ id: 'a', status: 'M', path: 'a.txt', additions: 1, deletions: 0, size: '1 KB', staged: false }];
  const snapshot: AppSnapshot = {
    scannedAt: 'old', categories: [], repos: [current], repoDetails: { 'repo-a': current }, selectedRepoId: 'repo-a', pullResults: [], commitCandidates: { 'repo-a': [] },
  };

  const next = mergeRepoSnapshotUpdate(snapshot, {
    repo: { ...repo('repo-a', 1), files: [{ ...current.files[0]!, additions: 2 }] },
    commitCandidates: [],
    scannedAt: 'new',
  });

  assert.notEqual(next.repoDetails['repo-a']?.files, current.files);
  assert.equal(next.repoDetails['repo-a']?.files[0]?.additions, 2);
});

test('mergeRepoSnapshotUpdate replaces a changed previous file size', () => {
  const current = repo('repo-a', 1);
  current.files = [{ id: 'a', status: 'M', path: 'a.png', additions: 1, deletions: 0, size: '2 KB', previousSize: '1 KB', staged: false }];
  const snapshot: AppSnapshot = {
    scannedAt: 'old', categories: [], repos: [current], repoDetails: { 'repo-a': current }, selectedRepoId: 'repo-a', pullResults: [], commitCandidates: { 'repo-a': [] },
  };

  const next = mergeRepoSnapshotUpdate(snapshot, {
    repo: { ...repo('repo-a', 1), files: [{ ...current.files[0]!, previousSize: '3 KB' }] },
    commitCandidates: [],
    scannedAt: 'new',
  }, 'background');

  assert.notEqual(next.repoDetails['repo-a']?.files, current.files);
  assert.equal(next.repoDetails['repo-a']?.files[0]?.previousSize, '3 KB');
});

test('mergeRepoSnapshotUpdate preserves file objects while applying a changed order', () => {
  const current = repo('repo-a', 2);
  current.files = [
    { id: 'a', status: 'M', path: 'a.txt', additions: 1, deletions: 0, size: '1 KB', staged: false },
    { id: 'b', status: 'M', path: 'b.txt', additions: 1, deletions: 0, size: '1 KB', staged: false },
  ];
  const snapshot: AppSnapshot = {
    scannedAt: 'old', categories: [], repos: [current], repoDetails: { 'repo-a': current }, selectedRepoId: 'repo-a', pullResults: [], commitCandidates: { 'repo-a': [] },
  };

  const next = mergeRepoSnapshotUpdate(snapshot, {
    repo: { ...repo('repo-a', 2), files: [current.files[1]!, current.files[0]!] },
    commitCandidates: [],
    scannedAt: 'new',
  }, 'background');

  assert.notEqual(next.repoDetails['repo-a']?.files, current.files);
  assert.equal(next.repoDetails['repo-a']?.files[0], current.files[1]);
  assert.equal(next.repoDetails['repo-a']?.files[1], current.files[0]);
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
