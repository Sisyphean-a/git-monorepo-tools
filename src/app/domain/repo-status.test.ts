import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldShowCleanIndicator } from './repo-status.js';
import type { Repo } from './types.js';

function createRepo(overrides: Partial<Repo> = {}): Repo {
  return {
    id: 'repo-1',
    name: 'repo',
    branch: 'main',
    path: '/repo',
    remote: 'origin',
    category: 'default',
    modified: 0,
    ahead: 0,
    behind: 0,
    conflicts: 0,
    status: 'clean',
    lastScan: '2026-07-01 10:00:00',
    remoteCheck: { status: 'success', checkedAt: '2026-07-01 10:00:00' },
    ...overrides,
  };
}

test('shouldShowCleanIndicator only marks truly clean repos', () => {
  assert.equal(shouldShowCleanIndicator(createRepo()), true);
  assert.equal(shouldShowCleanIndicator(createRepo({ status: 'error', scanError: 'git status failed' })), false);
  assert.equal(shouldShowCleanIndicator(createRepo({ remoteCheck: undefined })), false);
  assert.equal(shouldShowCleanIndicator(createRepo({ remoteCheck: { status: 'error', checkedAt: 'now', error: 'Fetch timeout' } })), false);
  assert.equal(shouldShowCleanIndicator(createRepo({ remote: '—', remoteCheck: undefined })), true);
});
