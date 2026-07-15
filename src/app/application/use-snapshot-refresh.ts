import { useEffect, useRef } from 'react';
import { createSnapshotCoordinator } from './snapshot-coordinator';
import type { AppSettings, AppSnapshot } from '../domain/types';
import type { WorkspaceBackend } from './ports';

interface SnapshotRefreshConfig {
  settings: AppSettings;
  applySnapshot: (snapshot: AppSnapshot) => void;
  reportError: (message: string | null) => void;
  fetchSnapshot: WorkspaceBackend['fetchSnapshot'];
  skipInitialRefresh?: boolean;
}

export function useSnapshotRefresh(config: SnapshotRefreshConfig) {
  const { settings, applySnapshot, reportError, fetchSnapshot, skipInitialRefresh = false } = config;
  const settingsRef = useRef(settings);
  const applySnapshotRef = useRef(applySnapshot);
  const reportErrorRef = useRef(reportError);
  const coordinatorRef = useRef(createSnapshotCoordinator({
    applySnapshot: snapshot => applySnapshotRef.current(snapshot),
    fetchSnapshot,
    reportError: message => reportErrorRef.current(message),
  }));

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    applySnapshotRef.current = applySnapshot;
    reportErrorRef.current = reportError;
  }, [applySnapshot, reportError]);

  useEffect(() => {
    if (skipInitialRefresh) return;
    let cancelled = false;
    void coordinatorRef.current.requestRefresh(settingsRef.current, { refreshRemotes: false })
      .then(() => {
        if (cancelled) return;
        void coordinatorRef.current.requestRefresh(settingsRef.current, { refreshRemotes: true })
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
        await coordinatorRef.current.requestRefresh(settingsRef.current, { refreshRemotes: true })
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
    beginProgressiveScan() {
      return coordinatorRef.current.beginProgressiveScan();
    },
    requestRefresh(nextSettings: AppSettings, fetchOptions?: Parameters<typeof fetchSnapshot>[1]) {
      return coordinatorRef.current.requestRefresh(nextSettings, fetchOptions);
    },
    refreshSnapshot(nextSettings = settingsRef.current) {
      return coordinatorRef.current.requestRefresh(nextSettings, { refreshRemotes: true });
    },
    runQueuedTask<T>(task: () => Promise<T>, onSuccess?: (result: T) => void) {
      return coordinatorRef.current.runTask(task, onSuccess);
    },
    runSnapshotTask<T>(task: () => Promise<T>, readSnapshot: (result: T) => AppSnapshot | null | undefined) {
      return coordinatorRef.current.runSnapshotTask(task, readSnapshot);
    },
  };
}

function formatRefreshError(error: unknown) {
  return error instanceof Error ? error.message : '仓库刷新失败';
}
