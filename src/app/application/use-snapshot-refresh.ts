import { useEffect, useRef, useState } from 'react';
import { createSnapshotCoordinator } from './snapshot-coordinator';
import type { SnapshotApplyContext } from '../domain/repo-snapshot-merge';
import type { AppSettings, AppSnapshot } from '../domain/types';
import type { SnapshotFetchOptions, WorkspaceBackend } from './ports';

interface SnapshotRefreshConfig {
  settings: AppSettings;
  applySnapshot: (snapshot: AppSnapshot, context?: SnapshotApplyContext) => void;
  reportError: (message: string | null) => void;
  fetchSnapshot: WorkspaceBackend['fetchSnapshot'];
  readRepoUpdateRevision: () => number;
  skipInitialRefresh?: boolean;
}

export function useSnapshotRefresh(config: SnapshotRefreshConfig) {
  const { settings, applySnapshot, reportError, fetchSnapshot, readRepoUpdateRevision, skipInitialRefresh = false } = config;
  const settingsRef = useRef(settings);
  const applySnapshotRef = useRef(applySnapshot);
  const reportErrorRef = useRef(reportError);
  const refreshCountRef = useRef(0);
  const [refreshing, setRefreshing] = useState(false);
  const coordinatorRef = useRef(createSnapshotCoordinator({
    applySnapshot: (snapshot, context) => applySnapshotRef.current(snapshot, context),
    fetchSnapshot,
    readRepoUpdateRevision,
    reportError: message => reportErrorRef.current(message),
  }));

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    applySnapshotRef.current = applySnapshot;
    reportErrorRef.current = reportError;
  }, [applySnapshot, reportError]);

  // Flow: 所有完整刷新统一计数，界面据此显示“扫描中”，不再只反映手动扫描按钮。
  const trackRefresh = <T,>(promise: Promise<T>) => {
    refreshCountRef.current += 1;
    setRefreshing(true);
    const settle = () => {
      refreshCountRef.current = Math.max(0, refreshCountRef.current - 1);
      if (refreshCountRef.current === 0) setRefreshing(false);
    };
    promise.then(settle, settle);
    return promise;
  };

  const requestRefresh = (nextSettings: AppSettings, fetchOptions?: SnapshotFetchOptions) =>
    trackRefresh(coordinatorRef.current.requestRefresh(nextSettings, fetchOptions));

  const refreshSnapshot = (
    nextSettings: AppSettings = settingsRef.current,
    fetchOptions: SnapshotFetchOptions = { refreshRemotes: true },
  ) => requestRefresh(nextSettings, fetchOptions);

  useEffect(() => {
    if (skipInitialRefresh) return;
    let cancelled = false;
    void requestRefresh(settingsRef.current, { refreshRemotes: false })
      .then(() => {
        if (cancelled) return;
        void requestRefresh(settingsRef.current, { refreshRemotes: true })
          .catch(error => reportErrorRef.current(formatRefreshError(error)));
      })
      .catch(error => reportErrorRef.current(formatRefreshError(error)));
    return () => {
      cancelled = true;
    };
  }, [skipInitialRefresh]);

  useEffect(() => {
    if (!settings.gitBehavior.autoScanEnabled) return;
    let cancelled = false;
    let timer = 0;

    const schedule = () => {
      timer = window.setTimeout(async () => {
        await requestRefresh(settingsRef.current, { refreshRemotes: true })
          .catch(error => reportErrorRef.current(formatRefreshError(error)));
        if (!cancelled) schedule();
      }, settings.gitBehavior.autoScanIntervalSeconds * 1000);
    };

    schedule();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [settings.gitBehavior.autoScanEnabled, settings.gitBehavior.autoScanIntervalSeconds]);

  return {
    refreshing,
    beginProgressiveScan() {
      return coordinatorRef.current.beginProgressiveScan();
    },
    requestRefresh,
    refreshSnapshot,
    runQueuedTask<T>(task: () => Promise<T>, onSuccess?: (result: T) => void) {
      return coordinatorRef.current.runTask(task, onSuccess);
    },
    runBackgroundTask<T>(task: () => Promise<T>, onSuccess?: (result: T) => void) {
      return coordinatorRef.current.runBackgroundTask(task, onSuccess);
    },
  };
}

function formatRefreshError(error: unknown) {
  return error instanceof Error ? error.message : '仓库刷新失败';
}
