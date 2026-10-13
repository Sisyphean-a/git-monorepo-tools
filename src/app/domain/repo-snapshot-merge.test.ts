import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeRepoSnapshotUpdate, mergeSnapshotPreservingInteractions } from './repo-snapshot-merge.js';
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

test('local polls and complete local snapshots preserve remote failure feedback until a successful remote check', () => {
  const current = {
    ...repo('repo-a', 0),
    remoteCheck: { status: 'error' as const, checkedAt: '2026-10-13 10:00:00', error: 'Fetch timeout' },
  };
  const snapshot: AppSnapshot = {
    scannedAt: 'old', categories: [], repos: [current], repoDetails: { 'repo-a': current }, selectedRepoId: 'repo-a', pullResults: [],
  };
  const local = { repo: repo('repo-a', 1), scannedAt: 'local' };
  const polled = mergeRepoSnapshotUpdate(snapshot, local, 'background');
  assert.equal(polled.repoDetails['repo-a']?.status, 'changed');
  assert.deepEqual(polled.repoDetails['repo-a']?.remoteCheck, current.remoteCheck);
  assert.deepEqual(polled.repos[0]?.remoteCheck, current.remoteCheck);
  const sidebar = mergeSidebarRepoUpdate({ ...snapshot, repos: [current] }, local);
  assert.deepEqual(sidebar.repos[0]?.remoteCheck, current.remoteCheck);
  const nextLocal: AppSnapshot = { ...snapshot, repos: [local.repo], repoDetails: { 'repo-a': local.repo } };
  const complete = mergeSnapshotPreservingInteractions(nextLocal, snapshot, new Map(), 0);
  assert.deepEqual(complete.repoDetails['repo-a']?.remoteCheck, current.remoteCheck);
  assert.equal(complete.repoDetails['repo-a']?.modified, 1);
  const success = mergeRepoSnapshotUpdate(polled, {
    repo: { ...repo('repo-a', 0), remoteCheck: { status: 'success', checkedAt: '2026-10-13 10:01:00' } },
    scannedAt: 'remote',
  }, 'background');
  assert.equal(success.repoDetails['repo-a']?.remoteCheck?.status, 'success');
  assert.equal(success.repoDetails['repo-a']?.remoteCheck?.error, undefined);
});

test('remote check feedback does not leak to another branch or upstream', () => {
  const current = { ...repo('repo-a', 0), remoteCheck: { status: 'error' as const, checkedAt: 'old', error: 'Fetch timeout' } };
  const snapshot: AppSnapshot = {
    scannedAt: 'old', categories: [], repos: [current], repoDetails: { 'repo-a': current }, selectedRepoId: 'repo-a', pullResults: [],
  };
  for (const change of [{ branch: 'other' }, { remote: 'upstream' }]) {
    const next = mergeRepoSnapshotUpdate(snapshot, { repo: { ...repo('repo-a', 0), ...change }, scannedAt: 'local' }, 'background');
    assert.equal(next.repoDetails['repo-a']?.remoteCheck, undefined);
  }
});

test('mergeRepoSnapshotUpdate replaces only target repo fields', () => {
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
  };
  const update: RepoSnapshotUpdate = {
    repo: {
      ...repo('repo-b', 3),
      lastScan: 'new',
      scannedAt: 'new',
      stagedCount: 1,
      files: [{ id: 'a', status: 'M', path: 'a.txt', additions: 1, deletions: 0, size: '1 KB', staged: true }],
    },
    scannedAt: 'merged-scan',
  };

  const next = mergeRepoSnapshotUpdate(snapshot, update);
  const repoA = next.repoDetails['repo-a'];
  const repoB = next.repoDetails['repo-b'];
  assert.ok(repoA);
  assert.ok(repoB);

  assert.equal(next.scannedAt, 'old-scan');
  assert.equal(repoB.modified, 3);
  assert.equal(repoA.modified, 0);
  assert.deepEqual(next.repos.map(item => item.id), ['repo-a', 'repo-b']);
  assert.equal('files' in next.repos[1]!, false);
});

test('mergeRepoSnapshotUpdate preserves reading data and stable file identities', () => {
  const current = repo('repo-a', 1);
  current.files = [{ id: 'a', status: 'M', path: 'a.txt', additions: 1, deletions: 0, size: '1 KB', staged: false }];
  current.history = [{ hash: 'abc', shortHash: 'abc', author: 'A', time: 'now', message: 'keep', additions: 1, deletions: 0, parents: 1, parentHashes: [], refs: [], files: 1 }];
  current.historyTotal = 1;
  const snapshot: AppSnapshot = {
    scannedAt: 'old', categories: [], repos: [current], repoDetails: { 'repo-a': current }, selectedRepoId: 'repo-a', pullResults: [],
  };

  const next = mergeRepoSnapshotUpdate(snapshot, {
    repo: { ...repo('repo-a', 1), scannedAt: 'new', files: current.files.map(file => ({ ...file })) },
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
    scannedAt: 'old', categories: [], repos: [current], repoDetails: { 'repo-a': current }, selectedRepoId: 'repo-a', pullResults: [],
  };

  const next = mergeRepoSnapshotUpdate(snapshot, {
    repo: { ...repo('repo-a', 0), headRevision: 'new-head' },
    scannedAt: 'background',
  }, 'background');

  assert.deepEqual(next.repoDetails['repo-a']?.history, []);
  assert.equal(next.repoDetails['repo-a']?.historyRevision, 'head-new-head');
});

test('reference changes refresh history even when HEAD and ahead/behind counts are unchanged', () => {
  const current = { ...repo('repo-a', 0), headRevision: 'same-head', refsRevision: 'old-refs', historyRevision: 'old-reading' };
  current.history = [{ hash: 'old', shortHash: 'old', author: 'A', time: 'now', message: 'old', additions: 0, deletions: 0, parents: 1, parentHashes: [], refs: [], files: 0 }];
  const snapshot: AppSnapshot = { scannedAt: 'old', categories: [], repos: [current], repoDetails: { 'repo-a': current }, selectedRepoId: 'repo-a', pullResults: [] };
  const incoming = { ...repo('repo-a', 0), headRevision: 'same-head', refsRevision: 'new-refs' };
  const updated = mergeRepoSnapshotUpdate(snapshot, { repo: incoming, scannedAt: 'fetch' }, 'background');
  assert.notEqual(updated.repoDetails['repo-a']?.historyRevision, current.historyRevision);
  assert.deepEqual(updated.repoDetails['repo-a']?.history, []);
  const complete = mergeSnapshotPreservingInteractions({ ...snapshot, repos: [incoming], repoDetails: { 'repo-a': incoming } }, snapshot, new Map(), 0);
  assert.notEqual(complete.repoDetails['repo-a']?.historyRevision, current.historyRevision);
  assert.deepEqual(complete.repoDetails['repo-a']?.history, []);
});

test('unchanged references preserve history across polls and complete local snapshots', () => {
  const current = { ...repo('repo-a', 0), headRevision: 'same-head', refsRevision: 'same-refs', historyRevision: 'keep-reading' };
  current.history = [{ hash: 'old', shortHash: 'old', author: 'A', time: 'now', message: 'keep', additions: 0, deletions: 0, parents: 1, parentHashes: [], refs: [], files: 0 }];
  const snapshot: AppSnapshot = { scannedAt: 'old', categories: [], repos: [current], repoDetails: { 'repo-a': current }, selectedRepoId: 'repo-a', pullResults: [] };
  const incoming = { ...repo('repo-a', 1), headRevision: 'same-head', refsRevision: 'same-refs' };
  const updated = mergeRepoSnapshotUpdate(snapshot, { repo: incoming, scannedAt: 'local' }, 'background');
  const complete = mergeSnapshotPreservingInteractions({ ...snapshot, repos: [incoming], repoDetails: { 'repo-a': incoming } }, snapshot, new Map(), 0);
  for (const result of [updated, complete]) {
    assert.equal(result.repoDetails['repo-a']?.historyRevision, 'keep-reading');
    assert.equal(result.repoDetails['repo-a']?.history, current.history);
    assert.equal(result.repoDetails['repo-a']?.modified, 1);
  }
});

test('interaction updates invalidate history reading data', () => {
  const current = repo('repo-a', 0);
  current.history = [{ hash: 'abc', shortHash: 'abc', author: 'A', time: 'now', message: 'old', additions: 0, deletions: 0, parents: 1, parentHashes: [], refs: [], files: 0 }];
  current.historyTotal = 1;
  current.historyRevision = 'old';
  const snapshot: AppSnapshot = {
    scannedAt: 'old', categories: [], repos: [current], repoDetails: { 'repo-a': current }, selectedRepoId: 'repo-a', pullResults: [],
  };

  const next = mergeRepoSnapshotUpdate(snapshot, {
    repo: repo('repo-a', 0),
    scannedAt: 'same-second',
  }, 'interaction', 'interaction-2');

  assert.deepEqual(next.repoDetails['repo-a']?.history, []);
  assert.equal(next.repoDetails['repo-a']?.historyRevision, 'interaction-2');
});

test('mergeRepoSnapshotUpdate replaces changed file summaries',  () => {
  const current = repo('repo-a', 1);
  current.files = [{ id: 'a', status: 'M', path: 'a.txt', additions: 1, deletions: 0, size: '1 KB', staged: false }];
  const snapshot: AppSnapshot = {
    scannedAt: 'old', categories: [], repos: [current], repoDetails: { 'repo-a': current }, selectedRepoId: 'repo-a', pullResults: [],
  };

  const next = mergeRepoSnapshotUpdate(snapshot, {
    repo: { ...repo('repo-a', 1), files: [{ ...current.files[0]!, additions: 2 }] },
    scannedAt: 'new',
  });

  assert.notEqual(next.repoDetails['repo-a']?.files, current.files);
  assert.equal(next.repoDetails['repo-a']?.files[0]?.additions, 2);
});

test('mergeRepoSnapshotUpdate replaces a changed previous file size', () => {
  const current = repo('repo-a', 1);
  current.files = [{ id: 'a', status: 'M', path: 'a.png', additions: 1, deletions: 0, size: '2 KB', previousSize: '1 KB', staged: false }];
  const snapshot: AppSnapshot = {
    scannedAt: 'old', categories: [], repos: [current], repoDetails: { 'repo-a': current }, selectedRepoId: 'repo-a', pullResults: [],
  };

  const next = mergeRepoSnapshotUpdate(snapshot, {
    repo: { ...repo('repo-a', 1), files: [{ ...current.files[0]!, previousSize: '3 KB' }] },
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
    scannedAt: 'old', categories: [], repos: [current], repoDetails: { 'repo-a': current }, selectedRepoId: 'repo-a', pullResults: [],
  };

  const next = mergeRepoSnapshotUpdate(snapshot, {
    repo: { ...repo('repo-a', 2), files: [current.files[1]!, current.files[0]!] },
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
    scannedAt: 'sidebar-scan',
  };

  const next = mergeSidebarRepoUpdate({
    scannedAt: 'old-scan',
    categories: ['测试'],
    repos: [repo('repo-a', 0), repo('repo-b', 1)],
  }, update);

  assert.equal(next.scannedAt, 'old-scan');
  assert.equal(next.repos[1]?.id, 'repo-b');
  assert.equal(next.repos[1]?.modified, 4);
  assert.equal('files' in next.repos[1]!, false);
  assert.deepEqual(next.categories, ['测试']);
});

test('mergeSnapshotPreservingInteractions keeps interaction-updated repos while applying list changes', () => {
  const currentRepoA = repo('repo-a', 5);
  currentRepoA.files = [{ id: 'a', status: 'M', path: 'a.txt', additions: 3, deletions: 0, size: '2 KB', staged: true }];
  const current: AppSnapshot = {
    scannedAt: 'old-scan',
    categories: ['测试'],
    repos: [currentRepoA, repo('repo-old', 1)],
    repoDetails: { 'repo-a': currentRepoA, 'repo-old': repo('repo-old', 1) },
    selectedRepoId: 'repo-a',
    pullResults: [],
  };
  const snapshotRepoA = repo('repo-a', 0);
  const next: AppSnapshot = {
    scannedAt: 'full-scan',
    categories: ['测试', '新分类'],
    repos: [snapshotRepoA, repo('repo-b', 0)],
    repoDetails: { 'repo-a': snapshotRepoA, 'repo-b': repo('repo-b', 0) },
    selectedRepoId: 'repo-a',
    pullResults: [],
  };
  const versions = new Map([['repo-a', 7], ['repo-old', 8]]);

  const merged = mergeSnapshotPreservingInteractions(next, current, versions, 3);

  assert.equal(merged.scannedAt, 'full-scan');
  assert.deepEqual(merged.repos.map(item => item.id), ['repo-a', 'repo-b']);
  assert.equal(merged.repoDetails['repo-a']?.modified, 5);
  assert.equal(merged.repoDetails['repo-a']?.files[0]?.id, 'a');
  assert.equal(merged.repoDetails['repo-b']?.modified, 0);
  assert.equal('repo-old' in merged.repoDetails, false);
});

test('mergeSnapshotPreservingInteractions ignores interactions that predate the snapshot fetch', () => {
  const current = repo('repo-a', 9);
  const currentSnapshot: AppSnapshot = {
    scannedAt: 'old-scan',
    categories: ['测试'],
    repos: [current],
    repoDetails: { 'repo-a': current },
    selectedRepoId: 'repo-a',
    pullResults: [],
  };
  const nextRepo = repo('repo-a', 0);
  const next: AppSnapshot = {
    scannedAt: 'full-scan',
    categories: ['测试'],
    repos: [nextRepo],
    repoDetails: { 'repo-a': nextRepo },
    selectedRepoId: 'repo-a',
    pullResults: [],
  };

  const merged = mergeSnapshotPreservingInteractions(next, currentSnapshot, new Map([['repo-a', 2]]), 5);

  assert.equal(merged.scannedAt, 'full-scan');
  assert.equal(merged.repoDetails['repo-a']?.modified, 0);
});

test('mergeSnapshotPreservingInteractions returns the snapshot when no current state exists', () => {
  const nextRepo = repo('repo-a', 0);
  const next: AppSnapshot = {
    scannedAt: 'full-scan',
    categories: [],
    repos: [nextRepo],
    repoDetails: { 'repo-a': nextRepo },
    selectedRepoId: 'repo-a',
    pullResults: [],
  };

  assert.equal(mergeSnapshotPreservingInteractions(next, null, new Map([['repo-a', 7]]), 1), next);
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
  };

  const next = mergeRepoSnapshotUpdate(snapshot, {
    repo: {
      ...repo('repo-c', 8),
      lastScan: 'new',
      scannedAt: 'new',
    },
    scannedAt: 'new-scan',
  });

  assert.deepEqual(next.repos.map(item => item.id), ['repo-a', 'repo-b', 'repo-c']);
  assert.equal(next.repos[2]?.modified, 8);
});
