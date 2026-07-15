import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS } from '../infrastructure/settings-store.js';
import type { AppSettings } from '../domain/types.js';
import { createSettingsActions } from './settings-actions.js';

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
