import test from 'node:test';
import assert from 'node:assert/strict';
import { refreshPolledRepo } from './use-repo-status-polling.js';
import { DEFAULT_SETTINGS } from '../infrastructure/settings-store.js';

type PollingConfig = Parameters<typeof refreshPolledRepo>[1]['current'];

function pollingFixture() {
  let requests = 0;
  let applied = 0;
  const repo = {
    id: 'repo', name: 'repo', branch: 'main', path: 'E:/repo', remote: '—', category: 'test',
    modified: 0, ahead: 0, behind: 0, conflicts: 0, status: 'clean' as const, lastScan: '',
  };
  const update = { repo: { ...repo, files: [], history: [], historyTotal: 0, historyHasMore: false, stagedCount: 0, unstagedCount: 0, scannedAt: '' }, scannedAt: '' };
  const config: PollingConfig = {
    backend: { refreshRepo: async () => { requests++; return update; } },
    settings: DEFAULT_SETTINGS,
    snapshot: { repos: [repo], repoDetails: { repo: update.repo }, scannedAt: '', categories: [], selectedRepoId: 'repo', pullResults: [] },
    selectedRepoId: 'repo',
    windowActive: true,
    startupScanActive: false,
    applyRepoUpdate: () => { applied++; },
    runBackgroundTask: async (task, onSuccess) => { const result = await task(); onSuccess?.(result); return result; },
  };
  return { configRef: { current: config }, inFlightRef: { current: new Map<string, Promise<void>>() }, counts: () => ({ requests, applied }), update };
}

test('queued polling is suppressed while inactive and resumes without retaining settled requests', async () => {
  const fixture = pollingFixture();
  fixture.configRef.current.windowActive = false;
  await refreshPolledRepo('repo', fixture.configRef, fixture.inFlightRef);
  assert.deepEqual(fixture.counts(), { requests: 0, applied: 0 });
  fixture.configRef.current.windowActive = true;
  await refreshPolledRepo('repo', fixture.configRef, fixture.inFlightRef);
  assert.deepEqual(fixture.counts(), { requests: 1, applied: 1 });
  assert.equal(fixture.inFlightRef.current.size, 0);
});

test('a running request is not cancelled on blur and overlapping polling is coalesced', async () => {
  const fixture = pollingFixture();
  let reads = 0;
  let finish!: () => void;
  const pending = new Promise<void>(resolve => { finish = resolve; });
  fixture.configRef.current.backend.refreshRepo = async () => { reads++; await pending; return fixture.update; };
  const first = refreshPolledRepo('repo', fixture.configRef, fixture.inFlightRef);
  const duplicate = refreshPolledRepo('repo', fixture.configRef, fixture.inFlightRef);
  fixture.configRef.current.windowActive = false;
  assert.equal(reads, 1);
  finish();
  await Promise.all([first, duplicate]);
  assert.equal(fixture.counts().applied, 1);
  assert.equal(fixture.inFlightRef.current.size, 0);
});
