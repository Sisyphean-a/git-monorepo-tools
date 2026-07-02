import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldShowCleanIndicator } from './repo-status.js';
function createRepo(overrides = {}) {
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
        ...overrides,
    };
}
test('shouldShowCleanIndicator only marks truly clean repos', () => {
    assert.equal(shouldShowCleanIndicator(createRepo()), true);
    assert.equal(shouldShowCleanIndicator(createRepo({ status: 'error', scanError: 'git status failed' })), false);
});
