import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS } from '../infrastructure/settings-store.js';
import { loadProgressiveStartupScan } from './use-progressive-startup-scan.js';

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
