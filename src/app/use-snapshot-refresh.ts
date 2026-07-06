import { useEffect, useRef } from 'react';
import { fetchSnapshot } from './api';
import { createSnapshotCoordinator } from './snapshot-coordinator';
import type { AppSettings, AppSnapshot } from './types';

export function useSnapshotRefresh(
  settings: AppSettings,
  applySnapshot: (snapshot: AppSnapshot) => void,
  reportError: (message: string | null) => void,
) {
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
    let cancelled = false;
    void coordinatorRef.current.requestRefresh(settingsRef.current, { refreshRemotes: false })
      .then(() => {
        if (cancelled) return;
        void coordinatorRef.current.requestRefresh(settingsRef.current, { refreshRemotes: true }).catch(() => {});
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!settings.gitBehavior.autoScanEnabled) return;
    let cancelled = false;
    let timer = 0;

    const schedule = () => {
      timer = window.setTimeout(async () => {
        await coordinatorRef.current.requestRefresh(settingsRef.current, { refreshRemotes: true }).catch(() => {});
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
    refreshSnapshot(nextSettings = settingsRef.current) {
      return coordinatorRef.current.requestRefresh(nextSettings, { refreshRemotes: true });
    },
    runSnapshotTask<T>(task: () => Promise<T>, readSnapshot: (result: T) => AppSnapshot | null | undefined) {
      return coordinatorRef.current.runSnapshotTask(task, readSnapshot);
    },
  };
}
