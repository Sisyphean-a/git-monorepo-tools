export function createSnapshotCoordinator(options) {
    const refreshQueue = [];
    let activeRefresh = null;
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
        if (activeRefresh)
            return activeRefresh;
        activeRefresh = runRefreshQueue(refreshQueue, options, () => interactionRevision, () => {
            activeRefresh = null;
            if (refreshQueue.length > 0)
                void processRefreshQueue();
        });
        return activeRefresh;
    };
    return {
        beginProgressiveScan() {
            const revision = invalidateProgressiveScan();
            return {
                isCurrent: () => revision === progressiveRevision,
                applySnapshot: snapshot => {
                    if (revision !== progressiveRevision)
                        return false;
                    options.applySnapshot(snapshot);
                    return true;
                },
                reportError: message => {
                    if (revision !== progressiveRevision)
                        return false;
                    options.reportError?.(message);
                    return true;
                },
            };
        },
        requestRefresh(settings, fetchOptions) {
            invalidateProgressiveScan();
            return enqueueRefresh(refreshQueue, settings, fetchOptions, processRefreshQueue);
        },
        runSnapshotTask(task, readSnapshot) {
            beginInteraction();
            const queued = enqueueForegroundTask(task, (result, nextOptions) => {
                const snapshot = readSnapshot(result);
                if (snapshot)
                    nextOptions.applySnapshot(snapshot);
            }, options, finishInteraction, foregroundTail);
            foregroundTail = queued.settled;
            return queued.promise;
        },
        runTask(task, onSuccess) {
            beginInteraction();
            const queued = enqueueForegroundTask(task, result => onSuccess?.(result), options, finishInteraction, foregroundTail);
            foregroundTail = queued.settled;
            return queued.promise;
        },
    };
}
async function runRefreshQueue(queue, options, currentInteractionRevision, onDone) {
    try {
        while (queue.length > 0) {
            const entry = queue.shift();
            if (!entry)
                continue;
            const revision = currentInteractionRevision();
            await runRefreshEntry(entry, options, () => revision === currentInteractionRevision());
        }
    }
    finally {
        onDone();
    }
}
function enqueueRefresh(queue, settings, fetchOptions, processQueue) {
    const existing = findTrailingRefresh(queue);
    if (existing) {
        existing.settings = settings;
        existing.fetchOptions = mergeFetchOptions(existing.fetchOptions, fetchOptions);
        return createRefreshPromise(existing);
    }
    const entry = { settings, fetchOptions, waiters: [] };
    const promise = createRefreshPromise(entry);
    queue.push(entry);
    void processQueue();
    return promise;
}
function enqueueForegroundTask(task, onSuccess, options, finishInteraction, tail) {
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
async function runRefreshEntry(entry, options, isCurrent) {
    try {
        const snapshot = await options.fetchSnapshot(entry.settings, entry.fetchOptions);
        if (isCurrent()) {
            options.applySnapshot(snapshot);
            options.reportError?.(null);
        }
        entry.waiters.forEach(waiter => waiter.resolve());
    }
    catch (error) {
        if (isCurrent())
            options.reportError?.(formatError(error));
        entry.waiters.forEach(waiter => waiter.reject(error));
    }
}
function createRefreshPromise(entry) {
    return new Promise((resolve, reject) => {
        entry.waiters.push({ resolve, reject });
    });
}
function findTrailingRefresh(queue) {
    return queue.at(-1) ?? null;
}
function mergeFetchOptions(current, next) {
    if (!current && !next)
        return undefined;
    return {
        refreshRemotes: Boolean(current?.refreshRemotes || next?.refreshRemotes),
    };
}
function formatError(error) {
    return error instanceof Error ? error.message : '刷新失败';
}
