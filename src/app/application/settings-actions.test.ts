import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS } from '../infrastructure/settings-store.js';
import type { AppSettings } from '../domain/types.js';
import { createSettingsActions, withScanRoots } from './settings-actions.js';

test('saveSettings persists first and reports a refresh failure', async () => {
  const events: string[] = [];
  const nextSettings = {
    ...DEFAULT_SETTINGS,
    customCategories: ['团队'],
  };
  const actions = createSettingsActions({
    backend: { pickFolder: async () => null },
    settingsStore: {
      loadSettings: () => DEFAULT_SETTINGS,
      saveSettings: (value: AppSettings) => events.push(`save:${value.customCategories.join(',')}`),
      sanitizeSettings: (value: unknown) => value as AppSettings,
    },
    settings: DEFAULT_SETTINGS,
    setSettings: value => {
      const next = typeof value === 'function' ? value(DEFAULT_SETTINGS) : value;
      events.push(`state:${next.customCategories.join(',')}`);
    },
    snapshot: null,
    refreshSnapshot: async () => { throw new Error('refresh failed'); },
    reportError: (error, fallback) => events.push(`${fallback}:${(error as Error).message}`),
  });

  actions.saveSettings(nextSettings);
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.deepEqual(events, [
    'state:团队',
    'save:团队',
    '刷新设置失败:refresh failed',
  ]);
});

test('removeScanRoot returns, persists, and refreshes with the remaining roots', async () => {
  const events: string[] = [];
  const settings: AppSettings = {
    ...DEFAULT_SETTINGS,
    scanRoots: [
      { path: 'D:/repos/keep', category: '保留' },
      { path: 'D:/repos/remove', category: '删除' },
    ],
  };
  const actions = createSettingsActions({
    backend: { pickFolder: async () => null },
    settingsStore: {
      loadSettings: () => settings,
      saveSettings: value => events.push(`save:${value.scanRoots.length}`),
      sanitizeSettings: value => value as AppSettings,
    },
    settings,
    setSettings: value => {
      const next = typeof value === 'function' ? value(settings) : value;
      events.push(`state:${next.scanRoots.length}`);
    },
    snapshot: null,
    refreshSnapshot: async value => { events.push(`refresh:${value.scanRoots.length}`); },
    reportError: () => undefined,
  });

  const next = actions.removeScanRoot('D:/repos/remove');
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.deepEqual(next.scanRoots, [{ path: 'D:/repos/keep', category: '保留' }]);
  assert.deepEqual(events, ['state:1', 'save:1', 'refresh:1']);
});

test('withScanRoots preserves other unsaved draft settings', () => {
  const draft: AppSettings = {
    ...DEFAULT_SETTINGS,
    scanRoots: [{ path: 'D:/repos/remove', category: '删除' }],
    aiCommit: { ...DEFAULT_SETTINGS.aiCommit, model: 'unsaved-model' },
  };

  const next = withScanRoots(draft, []);

  assert.deepEqual(next.scanRoots, []);
  assert.equal(next.aiCommit.model, 'unsaved-model');
  assert.notEqual(next, draft);
});
