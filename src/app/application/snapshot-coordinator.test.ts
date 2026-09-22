import test from 'node:test';
import assert from 'node:assert/strict';
import { createSnapshotCoordinator } from './snapshot-coordinator.js';
import type { AppSettings, AppSnapshot } from '../domain/types.js';

const settings = (concurrency: number): AppSettings => ({
  scanRoots: [],
  ignoredRepoPaths: [],
  customCategories: [],
  favoriteRepoIds: [],
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
    proxy: {
      enabled: false,
      host: '127.0.0.1',
      port: 7897,
    },
  },
  commandCenter: {
    combos: [],
    customCommands: [],
    projectCommands: {},
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

test('serializes foreground tasks independently from refreshes', async () => {
  const order: string[] = [];
  const gate = deferred<void>();
  const coordinator = createSnapshotCoordinator({
    applySnapshot: next => order.push(next.scannedAt),
    fetchSnapshot: async nextSettings => snapshot(`refresh-${nextSettings.gitBehavior.concurrency}`),
  });

  const firstTask = coordinator.runTask(async () => {
    order.push('first-task-start');
    await gate.promise;
    order.push('first-task-end');
    return 'first-task';
  });
  const secondTask = coordinator.runTask(async () => {
    order.push('second-task');
    return 'second-task';
  });
  gate.resolve();

  await Promise.all([firstTask, secondTask]);

  assert.deepEqual(order, [
    'first-task-start',
    'first-task-end',
    'second-task',
  ]);
});

test('applies a refresh that crossed an interaction and preserves interaction versions', async () => {
  const applied: Array<{ scannedAt: string; since: number | undefined }> = [];
  const taskGate = deferred<void>();
  const refreshGate = deferred<void>();
  const coordinator = createSnapshotCoordinator({
    applySnapshot: (next, context) => applied.push({
      scannedAt: next.scannedAt,
      since: context?.preserveInteractionsSince,
    }),
    fetchSnapshot: async () => {
      await refreshGate.promise;
      return snapshot('full-refresh');
    },
  });

  const task = coordinator.runTask(async () => {
    await taskGate.promise;
    return 'interaction';
  });
  await Promise.resolve();
  const refresh = coordinator.requestRefresh(settings(1));
  taskGate.resolve();
  await task;
  refreshGate.resolve();
  await refresh;

  assert.deepEqual(applied, [{ scannedAt: 'full-refresh', since: 1 }]);
});

test('applies background tasks only when no interaction superseded them', async () => {
  const applied: string[] = [];
  const staleGate = deferred<void>();
  const coordinator = createSnapshotCoordinator({
    applySnapshot: () => undefined,
    fetchSnapshot: async () => snapshot('unused'),
  });

  await coordinator.runBackgroundTask(async () => 'current-background', value => applied.push(value));
  const staleBackground = coordinator.runBackgroundTask(async () => {
    await staleGate.promise;
    return 'stale-background';
  }, value => applied.push(value));
  await coordinator.runTask(async () => 'interaction');
  staleGate.resolve();
  await staleBackground;

  assert.deepEqual(applied, ['current-background']);
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

test('continues after foreground task failure and reports error visibility', async () => {
  const messages: (string | null)[] = [];
  const applied: string[] = [];
  const coordinator = createSnapshotCoordinator({
    applySnapshot: next => applied.push(next.scannedAt),
    fetchSnapshot: async nextSettings => snapshot(`refresh-${nextSettings.gitBehavior.concurrency}`),
    reportError: message => messages.push(message),
  });

  const failedTask = coordinator.runTask(async () => {
    throw new Error('task-boom');
  });
  const refresh = coordinator.requestRefresh(settings(5));

  await assert.rejects(failedTask, /task-boom/);
  await refresh;

  assert.deepEqual(applied, ['refresh-5']);
  assert.ok(messages.includes('task-boom'));
  assert.ok(messages.includes(null));
});

test('invalidates progressive scan writes as soon as normal refresh is queued', async () => {
  const applied: string[] = [];
  const errors: (string | null)[] = [];
  const coordinator = createSnapshotCoordinator({
    applySnapshot: next => applied.push(next.scannedAt),
    fetchSnapshot: async () => snapshot('manual-refresh'),
    reportError: message => errors.push(message),
  });

  const startup = coordinator.beginProgressiveScan();
  assert.equal(startup.applySnapshot(snapshot('bootstrap')), true);

  const refresh = coordinator.requestRefresh(settings(5));

  assert.equal(startup.isCurrent(), false);
  assert.equal(startup.applySnapshot(snapshot('late-startup-result')), false);
  assert.equal(startup.reportError('late-startup-error'), false);
  await refresh;

  assert.deepEqual(applied, ['bootstrap', 'manual-refresh']);
  assert.deepEqual(errors, [null]);
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>(nextResolve => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}
