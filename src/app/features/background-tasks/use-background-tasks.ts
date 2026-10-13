import { useCallback, useEffect, useRef, useState } from 'react';
import type { BackgroundTaskBackend, RuntimeBackend } from '../../application/ports.js';
import { mergeTaskState, taskKey, type BackgroundTaskRequest, type BackgroundTaskState } from '../../domain/background-task.js';
import { taskErrorText } from './task-log-view.js';

export function useBackgroundTasks(backend: BackgroundTaskBackend & Pick<RuntimeBackend, 'onEvent'>) {
  const [states, setStates] = useState<Record<string, BackgroundTaskState>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const pendingKeys = useRef(new Set<string>());
  const refresh = useCallback(async () => {
    try {
      const list = await backend.listBackgroundTasks();
      setStates(current => list.reduce(mergeTaskState, current));
      setError(null);
    } catch (failure) {
      setError(taskErrorText(failure));
    }
  }, [backend]);

  useEffect(() => {
    let disposed = false;
    const unsubscribe = backend.onEvent('background-task-state', payload => {
      if (!disposed) setStates(current => mergeTaskState(current, payload as BackgroundTaskState));
    });
    void backend.listBackgroundTasks().then(list => {
      if (!disposed) setStates(current => list.reduce(mergeTaskState, current));
    }, failure => { if (!disposed) setError(taskErrorText(failure)); });
    return () => { disposed = true; unsubscribe(); };
  }, [backend]);

  const action = async (repoId: string, taskId: string, run: () => Promise<void>) => {
    const key = taskKey(repoId, taskId);
    if (pendingKeys.current.has(key)) return false;
    pendingKeys.current.add(key);
    setPending(new Set(pendingKeys.current));
    setError(null);
    try {
      await run();
      return true;
    } catch (failure) {
      setError(taskErrorText(failure));
      return false;
    } finally {
      pendingKeys.current.delete(key);
      setPending(new Set(pendingKeys.current));
    }
  };

  return {
    states, error, pending, refresh,
    start: (request: BackgroundTaskRequest) => action(request.repoId, request.taskId, async () => {
      const state = await backend.startBackgroundTask(request);
      setStates(current => mergeTaskState(current, state));
    }),
    stop: (repoId: string, taskId: string) => action(repoId, taskId, () => backend.stopBackgroundTask(repoId, taskId)),
    forget: (repoId: string, taskId: string) => action(repoId, taskId, async () => {
      await backend.forgetBackgroundTask(repoId, taskId);
      setStates(current => {
        const next = { ...current };
        delete next[taskKey(repoId, taskId)];
        return next;
      });
    }),
  };
}

export type BackgroundTaskController = ReturnType<typeof useBackgroundTasks>;
