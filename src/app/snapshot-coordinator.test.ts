import test from 'node:test';
import assert from 'node:assert/strict';
import { createSnapshotCoordinator } from './snapshot-coordinator.js';
import type { AppSettings, AppSnapshot } from './types.js';

const settings = (concurrency: number): AppSettings => ({
  scanRoots: [],
  customCategories: [],
  aiCommit: {
    apiKey: '',
    baseUrl: '',
    model: '',
    maxDiffChars: 2000,
    generateThree: false,
    stagedOnly: true,
    promptTemplate: '',
  },
  gitBehavior: {
    autoScanEnabled: true,
    autoScanIntervalSeconds: 60,
    pullStrategy: 'ff-only',
    pushStrategy: 'upstream-only',
    concurrency,
    timeoutSeconds: 60,
  },
  commandCenter: {
    combos: [],
    customCommands: [],
  },
});

const snapshot = (label: string): AppSnapshot => ({
  scannedAt: label,
  categories: [],
  repos: [],
  repoDetails: {},
  selectedRepoId: '',
  pullResults: [],
  commitCandidates: {},
});

test('coalesces queued refreshes and keeps latest settings', async () => {
  const calls: Array<{ concurrency: number; refreshRemotes: boolean }> = [];
  const applied: string[] = [];
  const gate = deferred<void>();
  const coordinator = createSnapshotCoordinator({
    applySnapshot: next => applied.push(next.scannedAt),
    fetchSnapshot: async (nextSettings, options) => {
      calls.push({
        concurrency: nextSettings.gitBehavior.concurrency,
        refreshRemotes: Boolean(options?.refreshRemotes),
      });
      if (calls.length === 1) await gate.promise;
      return snapshot(`refresh-${nextSettings.gitBehavior.concurrency}`);
    },
  });

  const first = coordinator.requestRefresh(settings(1), { refreshRemotes: false });
  const second = coordinator.requestRefresh(settings(3), { refreshRemotes: false });
  const third = coordinator.requestRefresh(settings(5), { refreshRemotes: true });
  gate.resolve();

  await Promise.all([first, second, third]);

  assert.deepEqual(calls, [
    { concurrency: 1, refreshRemotes: false },
    { concurrency: 5, refreshRemotes: true },
  ]);
  assert.deepEqual(applied, ['refresh-1', 'refresh-5']);
});

test('serializes refreshes and snapshot tasks', async () => {
  const order: string[] = [];
  const gate = deferred<void>();
  const coordinator = createSnapshotCoordinator({
    applySnapshot: next => order.push(next.scannedAt),
    fetchSnapshot: async nextSettings => {
      order.push(`fetch-${nextSettings.gitBehavior.concurrency}-start`);
      if (nextSettings.gitBehavior.concurrency === 1) await gate.promise;
      order.push(`fetch-${nextSettings.gitBehavior.concurrency}-end`);
      return snapshot(`refresh-${nextSettings.gitBehavior.concurrency}`);
    },
  });

  const refresh = coordinator.requestRefresh(settings(1));
  const task = coordinator.runSnapshotTask(
    async () => {
      order.push('task-run');
      return snapshot('task-snapshot');
    },
    result => result,
  );
  const queuedRefresh = coordinator.requestRefresh(settings(5));
  gate.resolve();

  await Promise.all([refresh, task, queuedRefresh]);

  assert.deepEqual(order, [
    'fetch-1-start',
    'fetch-1-end',
    'refresh-1',
    'task-run',
    'task-snapshot',
    'fetch-5-start',
    'fetch-5-end',
    'refresh-5',
  ]);
});

test('does not merge refresh across queued snapshot task boundaries', async () => {
  const order: string[] = [];
  const gate = deferred<void>();
  const coordinator = createSnapshotCoordinator({
    applySnapshot: next => order.push(next.scannedAt),
    fetchSnapshot: async nextSettings => {
      order.push(`refresh-${nextSettings.gitBehavior.concurrency}-start`);
      if (nextSettings.gitBehavior.concurrency === 1) await gate.promise;
      order.push(`refresh-${nextSettings.gitBehavior.concurrency}-end`);
      return snapshot(`refresh-${nextSettings.gitBehavior.concurrency}`);
    },
  });

  const firstRefresh = coordinator.requestRefresh(settings(1));
  const queuedTask = coordinator.runSnapshotTask(
    async () => {
      order.push('task-run');
      return snapshot('task-snapshot');
    },
    result => result,
  );
  const laterRefresh = coordinator.requestRefresh(settings(5));
  gate.resolve();

  await Promise.all([firstRefresh, queuedTask, laterRefresh]);

  assert.deepEqual(order, [
    'refresh-1-start',
    'refresh-1-end',
    'refresh-1',
    'task-run',
    'task-snapshot',
    'refresh-5-start',
    'refresh-5-end',
    'refresh-5',
  ]);
});

test('continues after refresh failure and reports error visibility', async () => {
  const messages: (string | null)[] = [];
  const applied: string[] = [];
  let attempts = 0;
  const coordinator = createSnapshotCoordinator({
    applySnapshot: next => applied.push(next.scannedAt),
    fetchSnapshot: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('boom');
      return snapshot('refresh-ok');
    },
    reportError: message => messages.push(message),
  });

  await assert.rejects(coordinator.requestRefresh(settings(1)), /boom/);
  await coordinator.requestRefresh(settings(5));

  assert.deepEqual(applied, ['refresh-ok']);
  assert.deepEqual(messages, ['boom', null]);
});

test('continues after snapshot task failure and reports error visibility', async () => {
  const messages: (string | null)[] = [];
  const applied: string[] = [];
  const coordinator = createSnapshotCoordinator({
    applySnapshot: next => applied.push(next.scannedAt),
    fetchSnapshot: async nextSettings => snapshot(`refresh-${nextSettings.gitBehavior.concurrency}`),
    reportError: message => messages.push(message),
  });

  const failedTask = coordinator.runSnapshotTask(
    async () => {
      throw new Error('task-boom');
    },
    () => null,
  );
  const refresh = coordinator.requestRefresh(settings(5));

  await assert.rejects(failedTask, /task-boom/);
  await refresh;

  assert.deepEqual(applied, ['refresh-5']);
  assert.deepEqual(messages, ['task-boom', null]);
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>(nextResolve => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}
