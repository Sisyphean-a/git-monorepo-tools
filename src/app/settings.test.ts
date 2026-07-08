import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, sanitizeSettings } from './settings.js';

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
