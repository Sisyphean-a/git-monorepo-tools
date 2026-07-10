import type { AppSettings, AppSnapshot } from './types.js';
import type { SnapshotFetchOptions } from './api.js';

type ErrorReporter = (message: string | null) => void;
type QueueEntry = RefreshEntry | TaskEntry;
type Waiter = { resolve: () => void; reject: (error: unknown) => void };

type RefreshEntry = {
  kind: 'refresh';
  settings: AppSettings;
  fetchOptions?: SnapshotFetchOptions;
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
  fetchSnapshot: (settings: AppSettings, options?: SnapshotFetchOptions) => Promise<AppSnapshot>;
  reportError?: ErrorReporter;
};

type TaskSuccessHandler<T> = (result: T, options: SnapshotCoordinatorOptions) => void;

export type ProgressiveSnapshotLease = {
  isCurrent: () => boolean;
  applySnapshot: (snapshot: AppSnapshot) => boolean;
  reportError: (message: string | null) => boolean;
};

export type SnapshotCoordinator = ReturnType<typeof createSnapshotCoordinator>;

export function createSnapshotCoordinator(options: SnapshotCoordinatorOptions) {
  const queue: QueueEntry[] = [];
  let activePromise: Promise<void> | null = null;
  let progressiveRevision = 0;

  const invalidateProgressiveScan = () => {
    progressiveRevision += 1;
    return progressiveRevision;
  };

  const processQueue = () => {
    if (activePromise) return activePromise;
    activePromise = runQueue(queue, options, () => {
      activePromise = null;
      if (queue.length > 0) void processQueue();
    }).catch(() => {});
    return activePromise;
  };

  return {
    beginProgressiveScan(): ProgressiveSnapshotLease {
      const revision = invalidateProgressiveScan();
      return {
        isCurrent: () => revision === progressiveRevision,
        applySnapshot: snapshot => {
          if (revision !== progressiveRevision) return false;
          options.applySnapshot(snapshot);
          return true;
        },
        reportError: message => {
          if (revision !== progressiveRevision) return false;
          options.reportError?.(message);
          return true;
        },
      };
    },
    requestRefresh(settings: AppSettings, fetchOptions?: SnapshotFetchOptions) {
      invalidateProgressiveScan();
      return enqueueRefresh(queue, settings, fetchOptions, processQueue);
    },
    runSnapshotTask<T>(task: () => Promise<T>, readSnapshot: (result: T) => AppSnapshot | null | undefined) {
      invalidateProgressiveScan();
      return enqueueTask(queue, task, (result, nextOptions) => {
        const snapshot = readSnapshot(result);
        if (snapshot) nextOptions.applySnapshot(snapshot);
      }, options, processQueue);
    },
    runTask<T>(task: () => Promise<T>, onSuccess?: (result: T) => void) {
      invalidateProgressiveScan();
      return enqueueTask(queue, task, result => {
        onSuccess?.(result);
      }, options, processQueue);
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

function enqueueRefresh(
  queue: QueueEntry[],
  settings: AppSettings,
  fetchOptions: SnapshotFetchOptions | undefined,
  processQueue: () => Promise<void>,
) {
  const existing = findTrailingRefresh(queue);
  if (existing) {
    existing.settings = settings;
    existing.fetchOptions = mergeFetchOptions(existing.fetchOptions, fetchOptions);
    return createRefreshPromise(existing);
  }
  const entry: RefreshEntry = { kind: 'refresh', settings, fetchOptions, waiters: [] };
  const promise = createRefreshPromise(entry);
  queue.push(entry);
  void processQueue();
  return promise;
}

function enqueueTask<T>(
  queue: QueueEntry[],
  task: () => Promise<T>,
  onSuccess: TaskSuccessHandler<T>,
  options: SnapshotCoordinatorOptions,
  processQueue: () => Promise<void>,
) {
  let resolvedValue: T | undefined;
  const promise = new Promise<T>((resolve, reject) => {
    queue.push({
      kind: 'task',
      run: async () => {
        resolvedValue = await task();
        onSuccess(resolvedValue, options);
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
  return options.fetchSnapshot(entry.settings, entry.fetchOptions)
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

function mergeFetchOptions(
  current: SnapshotFetchOptions | undefined,
  next: SnapshotFetchOptions | undefined,
): SnapshotFetchOptions | undefined {
  if (!current && !next) return undefined;
  return {
    refreshRemotes: Boolean(current?.refreshRemotes || next?.refreshRemotes),
  };
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : '刷新失败';
}
