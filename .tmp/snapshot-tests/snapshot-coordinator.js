export function createSnapshotCoordinator(options) {
    const queue = [];
    let activePromise = null;
    const processQueue = () => {
        if (activePromise)
            return activePromise;
        activePromise = runQueue(queue, options, () => {
            activePromise = null;
            if (queue.length > 0)
                void processQueue();
        }).catch(() => { });
        return activePromise;
    };
    return {
        requestRefresh(settings, fetchOptions) {
            return enqueueRefresh(queue, settings, fetchOptions, processQueue);
        },
        runSnapshotTask(task, readSnapshot) {
            return enqueueTask(queue, task, readSnapshot, options, processQueue);
        },
    };
}
function runQueue(queue, options, onDone) {
    return (async () => {
        try {
            while (queue.length > 0) {
                const entry = queue.shift();
                if (!entry)
                    continue;
                if (entry.kind === 'refresh') {
                    await runRefreshEntry(entry, options);
                    continue;
                }
                await runTaskEntry(entry, options);
            }
        }
        finally {
            onDone();
        }
    })();
}
function enqueueRefresh(queue, settings, fetchOptions, processQueue) {
    const existing = findTrailingRefresh(queue);
    if (existing) {
        existing.settings = settings;
        existing.fetchOptions = mergeFetchOptions(existing.fetchOptions, fetchOptions);
        return createRefreshPromise(existing);
    }
    const entry = { kind: 'refresh', settings, fetchOptions, waiters: [] };
    const promise = createRefreshPromise(entry);
    queue.push(entry);
    void processQueue();
    return promise;
}
function enqueueTask(queue, task, readSnapshot, options, processQueue) {
    let resolvedValue;
    const promise = new Promise((resolve, reject) => {
        queue.push({
            kind: 'task',
            run: async () => {
                resolvedValue = await task();
                const snapshot = readSnapshot(resolvedValue);
                if (snapshot)
                    options.applySnapshot(snapshot);
                options.reportError?.(null);
            },
            resolve: () => resolve(resolvedValue),
            reject,
        });
    });
    void processQueue();
    return promise;
}
function runRefreshEntry(entry, options) {
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
function runTaskEntry(entry, options) {
    return entry.run()
        .then(() => entry.resolve())
        .catch(error => {
        options.reportError?.(formatError(error));
        entry.reject(error);
        throw error;
    });
}
function createRefreshPromise(entry) {
    return new Promise((resolve, reject) => {
        entry.waiters.push({ resolve, reject });
    });
}
function findTrailingRefresh(queue) {
    const lastEntry = queue.at(-1);
    return lastEntry?.kind === 'refresh' ? lastEntry : null;
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
