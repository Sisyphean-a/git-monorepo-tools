import type { AppSettings, AppSnapshot } from '../domain/types.js';
import type { SnapshotFetchOptions } from './ports.js';

type ErrorReporter = (message: string | null) => void;
type Waiter = { resolve: () => void; reject: (error: unknown) => void };

type RefreshEntry = {
  settings: AppSettings;
  fetchOptions?: SnapshotFetchOptions;
  waiters: Waiter[];
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
  const refreshQueue: RefreshEntry[] = [];
  let activeRefresh: Promise<void> | null = null;
  let foregroundTail = Promise.resolve();
  let progressiveRevision = 0;
  let interactionRevision = 0;

  const invalidateProgressiveScan = () => {
    progressiveRevision += 1;
    return progressiveRevision;
  };

  const beginInteraction = () => {
    invalidateProgressiveScan();
    interactionRevision += 1;
  };

  const finishInteraction = () => {
    interactionRevision += 1;
  };

  const processRefreshQueue = () => {
    if (activeRefresh) return activeRefresh;
    activeRefresh = runRefreshQueue(refreshQueue, options, () => interactionRevision, () => {
      activeRefresh = null;
      if (refreshQueue.length > 0) void processRefreshQueue();
    });
    return activeRefresh;
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
      return enqueueRefresh(refreshQueue, settings, fetchOptions, processRefreshQueue);
    },
    runSnapshotTask<T>(task: () => Promise<T>, readSnapshot: (result: T) => AppSnapshot | null | undefined) {
      beginInteraction();
      const queued = enqueueForegroundTask(task, (result, nextOptions) => {
        const snapshot = readSnapshot(result);
        if (snapshot) nextOptions.applySnapshot(snapshot);
      }, options, finishInteraction, foregroundTail);
      foregroundTail = queued.settled;
      return queued.promise;
    },
    runTask<T>(task: () => Promise<T>, onSuccess?: (result: T) => void) {
      beginInteraction();
      const queued = enqueueForegroundTask(task, result => onSuccess?.(result), options, finishInteraction, foregroundTail);
      foregroundTail = queued.settled;
      return queued.promise;
    },
  };
}

async function runRefreshQueue(
  queue: RefreshEntry[],
  options: SnapshotCoordinatorOptions,
  currentInteractionRevision: () => number,
  onDone: () => void,
) {
  try {
    while (queue.length > 0) {
      const entry = queue.shift();
      if (!entry) continue;
      const revision = currentInteractionRevision();
      await runRefreshEntry(entry, options, () => revision === currentInteractionRevision());
    }
  } finally {
    onDone();
  }
}

function enqueueRefresh(
  queue: RefreshEntry[],
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
  const entry: RefreshEntry = { settings, fetchOptions, waiters: [] };
  const promise = createRefreshPromise(entry);
  queue.push(entry);
  void processQueue();
  return promise;
}

function enqueueForegroundTask<T>(
  task: () => Promise<T>,
  onSuccess: TaskSuccessHandler<T>,
  options: SnapshotCoordinatorOptions,
  finishInteraction: () => void,
  tail: Promise<void>,
) {
  const pending = tail.then(async () => {
    const result = await task();
    finishInteraction();
    onSuccess(result, options);
    options.reportError?.(null);
    return result;
  });
  const promise = pending.catch(error => {
    options.reportError?.(formatError(error));
    throw error;
  });
  return { promise, settled: promise.then(() => undefined, () => undefined) };
}

async function runRefreshEntry(
  entry: RefreshEntry,
  options: SnapshotCoordinatorOptions,
  isCurrent: () => boolean,
) {
  try {
    const snapshot = await options.fetchSnapshot(entry.settings, entry.fetchOptions);
    if (isCurrent()) {
      options.applySnapshot(snapshot);
      options.reportError?.(null);
    }
    entry.waiters.forEach(waiter => waiter.resolve());
  } catch (error) {
    if (isCurrent()) options.reportError?.(formatError(error));
    entry.waiters.forEach(waiter => waiter.reject(error));
  }
}

function createRefreshPromise(entry: RefreshEntry) {
  return new Promise<void>((resolve, reject) => {
    entry.waiters.push({ resolve, reject });
  });
}

function findTrailingRefresh(queue: RefreshEntry[]) {
  return queue.at(-1) ?? null;
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
