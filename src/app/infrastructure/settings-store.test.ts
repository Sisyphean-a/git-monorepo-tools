import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, sanitizeSettings } from './settings-store.js';

test('default settings include manual git proxy defaults', () => {
  assert.deepEqual(DEFAULT_SETTINGS.gitBehavior.proxy, {
    enabled: false,
    host: '127.0.0.1',
    port: 7897,
  });
});

test('sanitizeSettings keeps proxy host and normalizes invalid port', () => {
  const settings = sanitizeSettings({
    gitBehavior: {
      proxy: {
        enabled: true,
        host: ' 10.0.0.2 ',
        port: 99999,
      },
    },
  });

  assert.deepEqual(settings.gitBehavior.proxy, {
    enabled: true,
    host: '10.0.0.2',
    port: 7897,
  });
});

test('sanitizeSettings trims and deduplicates custom categories', () => {
  const settings = sanitizeSettings({
    customCategories: [' 团队 ', '团队', '', '个人'],
  });

  assert.deepEqual(settings.customCategories, ['团队', '个人']);
});

test('sanitizeSettings trims and deduplicates favorite repository IDs', () => {
  const settings = sanitizeSettings({
    favoriteRepoIds: [' repo-a ', 'repo-a', '', 'repo-b'],
  });

  assert.deepEqual(settings.favoriteRepoIds, ['repo-a', 'repo-b']);
});

test('sanitizeSettings keeps commands scoped to their repository IDs', () => {
  const settings = sanitizeSettings({
    commandCenter: {
      projectCommands: {
        ' repo-a ': [
          { id: ' build ', label: ' 构建 ', command: ' npm run build ' },
          { id: 'invalid', label: '', command: 'npm test' },
        ],
        ' ': [{ id: 'ignored', label: '忽略', command: 'echo ignored' }],
        'repo-b': [],
      },
    },
  });

  assert.deepEqual(settings.commandCenter.projectCommands, {
    'repo-a': [{ id: 'build', label: '构建', command: 'npm run build' }],
  });
});

test('sanitizeSettings accepts settings saved before project commands existed', () => {
  const settings = sanitizeSettings({
    commandCenter: {
      customCommands: [{ id: 'global', label: '全局', command: 'npm test' }],
    },
  });

  assert.deepEqual(settings.commandCenter.projectCommands, {});
  assert.deepEqual(settings.commandCenter.customCommands, [{ id: 'global', label: '全局', command: 'npm test' }]);
});
