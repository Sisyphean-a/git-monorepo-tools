import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS } from '../infrastructure/settings-store.js';
import {
  executeBatchAction,
  type BatchControllerConfig,
  type BatchRunState,
} from './use-batch-controller.js';

function createConfig(overrides: Partial<BatchControllerConfig> = {}): BatchControllerConfig {
  return {
    backend: { runBatch: async () => ({ scannedAt: '2026-07-14', results: [] }) },
    settings: DEFAULT_SETTINGS,
    runQueuedTask: async (task, onSuccess) => {
      const result = await task();
      onSuccess?.(result);
      return result;
    },
    applyRepoUpdate: () => {},
    mutateRepo: async () => { throw new Error('not used'); },
    openRepo: async () => {},
    openRepoLog: async () => {},
    reportError: () => {},
    ...overrides,
  };
}

function createState(events: string[]): BatchRunState {
  return {
    setOpen: value => events.push(`open:${value}`),
    setOperation: value => events.push(`operation:${value}`),
    setResults: value => events.push(`results:${value.length}`),
    setScannedAt: value => events.push(`scanned:${value}`),
    setActiveAction: value => events.push(`active:${value ?? 'none'}`),
  };
}

test('executeBatchAction publishes a successful batch and clears activity', async () => {
  const events: string[] = [];
  await executeBatchAction(createConfig(), createState(events), 'pull');

  assert.deepEqual(events, [
    'active:pull',
    'operation:pullAll',
    'results:0',
    'scanned:2026-07-14',
    'open:true',
    'active:none',
  ]);
});

test('executeBatchAction reports failure and still clears activity', async () => {
  const events: string[] = [];
  const failures: string[] = [];
  const config = createConfig({
    runQueuedTask: async () => { throw new Error('network down'); },
    reportError: (error, fallback) => failures.push(`${fallback}:${(error as Error).message}`),
  });

  await executeBatchAction(config, createState(events), 'push');

  assert.deepEqual(events, ['active:push', 'active:none']);
  assert.deepEqual(failures, ['批量推送失败:network down']);
});
