import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS } from '../infrastructure/settings-store.js';
import { loadProgressiveStartupScan } from './use-progressive-startup-scan.js';

test('loadProgressiveStartupScan opens the first available favorite by default', async () => {
  let selectedRepoId = '';
  await loadProgressiveStartupScan({
    settings: { ...DEFAULT_SETTINGS, favoriteRepoIds: ['repo-b', 'repo-a'] },
    backend: {
      fetchWorkspaceBootstrap: async () => ({
        repos: [
          { id: 'repo-a', name: 'repo-a', branch: '扫描中', path: 'E:/repos/repo-a', remote: '—', category: '默认工作区', modified: 0, ahead: 0, behind: 0, conflicts: 0, status: 'checking', lastScan: '10:00:00' },
          { id: 'repo-b', name: 'repo-b', branch: '扫描中', path: 'E:/repos/repo-b', remote: '—', category: '默认工作区', modified: 0, ahead: 0, behind: 0, conflicts: 0, status: 'checking', lastScan: '10:00:00' },
        ],
        selectedRepoId: 'repo-a',
        scannedAt: 'bootstrap-time',
        categories: ['默认工作区'],
      }),
      refreshRepo: async () => { throw new Error('not needed for selection assertion'); },
    },
    coordinator: {
      beginProgressiveScan: () => { throw new Error('not used'); },
      requestRefresh: async () => undefined,
    },
    handlers: {
      getPreferredRepoId: () => '',
      applySnapshot: snapshot => { selectedRepoId = snapshot.selectedRepoId; },
      applyRepoUpdate: () => undefined,
      reportError: () => undefined,
      isCurrent: () => true,
    },
  });

  assert.equal(selectedRepoId, 'repo-b');
});

test('loadProgressiveStartupScan applies bootstrap before the final remote refresh', async () => {
  const events: string[] = [];
  await loadProgressiveStartupScan({
    settings: DEFAULT_SETTINGS,
    backend: {
      fetchWorkspaceBootstrap: async () => ({
        repos: [],
        selectedRepoId: '',
        scannedAt: 'bootstrap-time',
        categories: ['默认'],
      }),
      refreshRepo: async () => { throw new Error('no repos should be refreshed'); },
    },
    coordinator: {
      beginProgressiveScan: () => { throw new Error('not used'); },
      requestRefresh: async (_settings, options) => {
        events.push(`refresh:${String(options?.refreshRemotes)}`);
      },
    },
    handlers: {
      getPreferredRepoId: () => '',
      applySnapshot: snapshot => events.push(`snapshot:${snapshot.scannedAt}`),
      applyRepoUpdate: () => events.push('unexpected-update'),
      reportError: error => events.push(`error:${error ?? 'none'}`),
      isCurrent: () => true,
    },
  });

  assert.deepEqual(events, [
    'snapshot:bootstrap-time',
    'error:none',
    'refresh:true',
  ]);
});
