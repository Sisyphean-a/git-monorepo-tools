import test from 'node:test';
import assert from 'node:assert/strict';
import { createSnapshotCoordinator as createCoordinator } from './snapshot-coordinator.js';
import { mergeRepoSnapshotUpdate, mergeSnapshotPreservingInteractions } from '../domain/repo-snapshot-merge.js';
import type { AppSettings, AppSnapshot, RepoDetail, RepoSnapshotUpdate } from '../domain/types.js';

type CoordinatorOptions = Parameters<typeof createCoordinator>[0];

function createSnapshotCoordinator(options: Omit<CoordinatorOptions, 'refreshRepo' | 'applyRepoUpdate'> & Partial<Pick<CoordinatorOptions, 'refreshRepo' | 'applyRepoUpdate'>>) {
  return createCoordinator({
    refreshRepo: async () => { throw new Error('本地刷新不应访问远端'); },
    applyRepoUpdate: () => {},
    ...options,
  });
}

const settings = (concurrency: number): AppSettings => ({
  scanRoots: [],
  ignoredRepoPaths: [],
  customCategories: [],
  favoriteRepoIds: [],
  fileTreeWidths: {},
  backgroundTasks: {},
  aiCommit: {
    apiKey: '',
    baseUrl: '',
    model: '',
    maxDiffChars: 2000,
    stagedOnly: true,
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
  terminalOperations: { rightClickCopyPaste: false },
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
});

test('repo-owned foreground errors remain rejected without contaminating or clearing global errors', async () => {
  const reported: (string | null)[] = [];
  const coordinator = createSnapshotCoordinator({
    applySnapshot: () => {}, readRepoUpdateRevision: () => 0,
    fetchSnapshot: async () => snapshot('unused'), reportError: error => reported.push(error),
  });
  await assert.rejects(coordinator.runTask(async () => { throw 'error in repo A'; }, undefined, { reportErrors: false }), error => error === 'error in repo A');
  assert.equal(await coordinator.runTask(async () => 'done', undefined, { reportErrors: false }), 'done');
  assert.deepEqual(reported, []);
  await assert.rejects(coordinator.runTask(async () => { throw 'workspace scan error'; }), error => error === 'workspace scan error');
  assert.deepEqual(reported, ['workspace scan error']);
});

test('coalesces queued refreshes and keeps latest settings', async () => {
  const calls: Array<{ concurrency: number; refreshRemotes: boolean }> = [];
  const applied: string[] = [];
  const gate = deferred<void>();
  const coordinator = createSnapshotCoordinator({
    applySnapshot: next => applied.push(next.scannedAt),
    readRepoUpdateRevision: () => 0,
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
    { concurrency: 5, refreshRemotes: false },
  ]);
  assert.deepEqual(applied, ['refresh-1', 'refresh-5']);
});

test('serializes foreground tasks independently from refreshes', async () => {
  const order: string[] = [];
  const gate = deferred<void>();
  const coordinator = createSnapshotCoordinator({
    applySnapshot: next => order.push(next.scannedAt),
    readRepoUpdateRevision: () => 0,
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
    readRepoUpdateRevision: () => 1,
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

test('keeps a repo interaction completed during a full refresh after an earlier interaction', async () => {
  const repo = (modified: number): RepoDetail => ({
    id: 'repo-a', name: 'repo-a', branch: 'main', path: '/repo-a', remote: '', category: 'test',
    modified, ahead: 0, behind: 0, conflicts: 0, status: modified ? 'changed' : 'clean',
    lastScan: 'now', files: [], stagedCount: 0, unstagedCount: modified, scannedAt: 'now',
    history: [], historyTotal: 0, historyHasMore: false,
  });
  let current: AppSnapshot = {
    ...snapshot('initial'), repos: [repo(0)], repoDetails: { 'repo-a': repo(0) }, selectedRepoId: 'repo-a',
  };
  const incoming: AppSnapshot = {
    ...snapshot('full-refresh'), repos: [repo(0)], repoDetails: { 'repo-a': repo(0) }, selectedRepoId: 'repo-a',
  };
  const versions = new Map<string, number>();
  let repoUpdateRevision = 0;
  const refreshGate = deferred<void>();
  const coordinator = createSnapshotCoordinator({
    applySnapshot: (next, context) => {
      current = mergeSnapshotPreservingInteractions(next, current, versions, context!.preserveInteractionsSince);
    },
    readRepoUpdateRevision: () => repoUpdateRevision,
    fetchSnapshot: async () => {
      await refreshGate.promise;
      return incoming;
    },
  });
  const updateRepo = (modified: number) => {
    versions.set('repo-a', ++repoUpdateRevision);
    current = mergeRepoSnapshotUpdate(current, {
      repo: repo(modified), scannedAt: 'now',
    }, 'interaction', `interaction-${repoUpdateRevision}`);
  };

  await coordinator.runTask(async () => 1, updateRepo);
  const refresh = coordinator.requestRefresh(settings(1));
  await coordinator.runTask(async () => 2, updateRepo);
  refreshGate.resolve();
  await refresh;

  assert.equal(current.scannedAt, 'full-refresh');
  assert.equal(current.repoDetails['repo-a']?.modified, 2);
});

test('applies background tasks only when no interaction superseded them', async () => {
  const applied: string[] = [];
  const staleGate = deferred<void>();
  const coordinator = createSnapshotCoordinator({
    applySnapshot: () => undefined,
    readRepoUpdateRevision: () => 0,
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
    readRepoUpdateRevision: () => 0,
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
    readRepoUpdateRevision: () => 0,
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
    readRepoUpdateRevision: () => 0,
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

const repoDetail = (id: string, behind = 0): RepoDetail => ({
  id, name: id, branch: 'main', path: `/repos/${id}`, remote: 'origin', category: 'test',
  modified: 0, ahead: 0, behind, conflicts: 0, status: 'clean', lastScan: 'now',
  files: [], stagedCount: 0, unstagedCount: 0, scannedAt: 'now',
  history: [], historyTotal: 0, historyHasMore: false,
});

const repoSnapshot = (...repos: RepoDetail[]): AppSnapshot => ({
  ...snapshot('local-discovery'),
  repos,
  repoDetails: Object.fromEntries(repos.map(repo => [repo.id, repo])),
  selectedRepoId: repos[0]?.id ?? '',
});

const nextTurn = () => new Promise<void>(resolve => setImmediate(resolve));

test('remote refresh publishes each completed repo while a slow repo is still pending', async () => {
  const slow = deferred<void>();
  const updates: RepoSnapshotUpdate[] = [];
  const calls: string[] = [];
  let active = 0;
  let maxActive = 0;
  let settled = false;
  const nextSettings = settings(2);
  nextSettings.gitBehavior.proxy = { enabled: true, host: 'proxy.test', port: 2080 };
  const coordinator = createSnapshotCoordinator({
    readRepoUpdateRevision: () => 0,
    fetchSnapshot: async (receivedSettings, options) => {
      assert.equal(receivedSettings, nextSettings);
      assert.equal(options?.refreshRemotes, false);
      return repoSnapshot(repoDetail('slow'), repoDetail('fast'), repoDetail('third'));
    },
    applySnapshot: next => calls.push(`snapshot:${next.repos.length}`),
    refreshRepo: async (id, receivedSettings, options, target) => {
      assert.equal(receivedSettings, nextSettings);
      assert.equal(options?.refreshRemotes, true);
      assert.deepEqual(target, { path: `/repos/${id}`, category: 'test' });
      calls.push(`fetch:${id}`);
      active += 1;
      maxActive = Math.max(maxActive, active);
      if (id === 'slow') await slow.promise;
      active -= 1;
      return { repo: repoDetail(id, 3), scannedAt: 'remote' };
    },
    applyRepoUpdate: update => updates.push(update),
  });
  const refresh = coordinator.requestRefresh(nextSettings, { refreshRemotes: true });
  void refresh.then(() => { settled = true; });
  await nextTurn();

  assert.equal(settled, false);
  assert.deepEqual(updates.map(update => update.repo.id), ['fast', 'third']);
  assert.equal(updates[0]?.repo.behind, 3);
  assert.equal(calls[0], 'snapshot:3');
  assert.equal(maxActive, 2);
  slow.resolve();
  await refresh;
  assert.deepEqual(updates.map(update => update.repo.id), ['fast', 'third', 'slow']);
  assert.equal(calls.filter(call => call.startsWith('snapshot:')).length, 1);
});

test('local-only refresh replaces the discovered repo list without fetching remotes', async () => {
  let current = repoSnapshot(repoDetail('removed'));
  let remoteCalls = 0;
  const coordinator = createSnapshotCoordinator({
    readRepoUpdateRevision: () => 0,
    fetchSnapshot: async () => repoSnapshot(repoDetail('discovered')),
    applySnapshot: next => { current = next; },
    refreshRepo: async id => {
      remoteCalls += 1;
      return { repo: repoDetail(id), scannedAt: 'remote' };
    },
    applyRepoUpdate: () => {},
  });
  await coordinator.requestRefresh(settings(2), { refreshRemotes: false });
  assert.deepEqual(current.repos.map(repo => repo.id), ['discovered']);
  assert.equal(remoteCalls, 0);
});

test('remote failures publish a repo error without holding back successful repos', async () => {
  const updates: RepoSnapshotUpdate[] = [];
  const coordinator = createSnapshotCoordinator({
    readRepoUpdateRevision: () => 0,
    fetchSnapshot: async () => repoSnapshot(repoDetail('broken'), repoDetail('healthy')),
    applySnapshot: () => {},
    refreshRepo: async id => {
      if (id === 'broken') throw 'proxy connection failed';
      return { repo: repoDetail(id, 2), scannedAt: 'remote' };
    },
    applyRepoUpdate: update => updates.push(update),
  });
  await coordinator.requestRefresh(settings(2), { refreshRemotes: true });
  assert.equal(updates.find(update => update.repo.id === 'healthy')?.repo.behind, 2);
  assert.equal(updates.find(update => update.repo.id === 'broken')?.repo.status, 'error');
  assert.equal(updates.find(update => update.repo.id === 'broken')?.repo.scanError, 'proxy connection failed');
});

test('remote repo writes carry the request revision so later interactions stay authoritative', async () => {
  const gate = deferred<void>();
  let revision = 0;
  const versions = new Map<string, number>();
  let current = repoSnapshot(repoDetail('repo-a'), repoDetail('repo-b'));
  const coordinator = createSnapshotCoordinator({
    readRepoUpdateRevision: () => revision,
    fetchSnapshot: async () => current,
    applySnapshot: next => { current = next; },
    refreshRepo: async id => {
      await gate.promise;
      return { repo: repoDetail(id, 4), scannedAt: 'remote' };
    },
    applyRepoUpdate: (update, context) => {
      if ((versions.get(update.repo.id) ?? 0) > context.preserveInteractionsSince) return;
      current = mergeRepoSnapshotUpdate(current, update, 'background');
    },
  });
  const refresh = coordinator.requestRefresh(settings(2), { refreshRemotes: true });
  await nextTurn();
  await coordinator.runTask(async () => undefined, () => {
    versions.set('repo-a', ++revision);
    current = mergeRepoSnapshotUpdate(current, { repo: repoDetail('repo-a', 0), scannedAt: 'interaction' });
  });
  gate.resolve();
  await refresh;
  assert.equal(current.repoDetails['repo-a']?.behind, 0);
  assert.equal(current.repoDetails['repo-b']?.behind, 4);
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>(nextResolve => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}
