import type { AppSettings, AppSnapshot } from './types.js';

type ErrorReporter = (message: string | null) => void;
type QueueEntry = RefreshEntry | TaskEntry;
type Waiter = { resolve: () => void; reject: (error: unknown) => void };

type RefreshEntry = {
  kind: 'refresh';
  settings: AppSettings;
  waiters: Waiter[];
};

type TaskEntry = {
  kind: 'task';
  run: () => Promise<void>;
  resolve: () => void;
  reject: (error: unknown) => void;
};

type SnapshotCoordinatorOptions = {
  applySnapshot: (snapshot: AppSnapshot) => void;
  fetchSnapshot: (settings: AppSettings) => Promise<AppSnapshot>;
  reportError?: ErrorReporter;
};

export type SnapshotCoordinator = ReturnType<typeof createSnapshotCoordinator>;

export function createSnapshotCoordinator(options: SnapshotCoordinatorOptions) {
  const queue: QueueEntry[] = [];
  let activePromise: Promise<void> | null = null;

  const processQueue = () => {
    if (activePromise) return activePromise;
    activePromise = runQueue(queue, options, () => {
      activePromise = null;
      if (queue.length > 0) void processQueue();
    }).catch(() => {});
    return activePromise;
  };

  return {
    requestRefresh(settings: AppSettings) {
      return enqueueRefresh(queue, settings, processQueue);
    },
    runSnapshotTask<T>(task: () => Promise<T>, readSnapshot: (result: T) => AppSnapshot | null | undefined) {
      return enqueueTask(queue, task, readSnapshot, options, processQueue);
    },
  };
}

function runQueue(queue: QueueEntry[], options: SnapshotCoordinatorOptions, onDone: () => void) {
  return (async () => {
    try {
      while (queue.length > 0) {
        const entry = queue.shift();
        if (!entry) continue;
        if (entry.kind === 'refresh') {
          await runRefreshEntry(entry, options);
          continue;
        }
        await runTaskEntry(entry, options);
      }
    } finally {
      onDone();
    }
  })();
}

function enqueueRefresh(queue: QueueEntry[], settings: AppSettings, processQueue: () => Promise<void>) {
  const existing = findTrailingRefresh(queue);
  if (existing) {
    existing.settings = settings;
    return createRefreshPromise(existing);
  }
  const entry: RefreshEntry = { kind: 'refresh', settings, waiters: [] };
  const promise = createRefreshPromise(entry);
  queue.push(entry);
  void processQueue();
  return promise;
}

function enqueueTask<T>(
  queue: QueueEntry[],
  task: () => Promise<T>,
  readSnapshot: (result: T) => AppSnapshot | null | undefined,
  options: SnapshotCoordinatorOptions,
  processQueue: () => Promise<void>,
) {
  let resolvedValue: T | undefined;
  const promise = new Promise<T>((resolve, reject) => {
    queue.push({
      kind: 'task',
      run: async () => {
        resolvedValue = await task();
        const snapshot = readSnapshot(resolvedValue);
        if (snapshot) options.applySnapshot(snapshot);
        options.reportError?.(null);
      },
      resolve: () => resolve(resolvedValue as T),
      reject,
    });
  });
  void processQueue();
  return promise;
}

function runRefreshEntry(entry: RefreshEntry, options: SnapshotCoordinatorOptions) {
  return options.fetchSnapshot(entry.settings)
    .then(snapshot => {
      options.applySnapshot(snapshot);
      options.reportError?.(null);
      entry.waiters.forEach(waiter => waiter.resolve());
    })
    .catch(error => {
      options.reportError?.(formatError(error));
      entry.waiters.forEach(waiter => waiter.reject(error));
      throw error;
    });
}

function runTaskEntry(entry: TaskEntry, options: SnapshotCoordinatorOptions) {
  return entry.run()
    .then(() => entry.resolve())
    .catch(error => {
      options.reportError?.(formatError(error));
      entry.reject(error);
      throw error;
    });
}

function createRefreshPromise(entry: RefreshEntry) {
  return new Promise<void>((resolve, reject) => {
    entry.waiters.push({ resolve, reject });
  });
}

function findTrailingRefresh(queue: QueueEntry[]) {
  const lastEntry = queue.at(-1);
  return lastEntry?.kind === 'refresh' ? lastEntry : null;
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : '刷新失败';
}
