import { useEffect, useRef, useState } from 'react';
import { fetchWorkspaceBootstrap, type SnapshotFetchOptions } from './api';
import { buildBootstrapSnapshot } from './bootstrap-snapshot';
import { loadProgressiveRepoUpdate, normalizeProgressiveConcurrency, orderProgressiveTargets } from './progressive-repo-scan';
import type { AppSettings, AppSnapshot, RepoSnapshotUpdate } from './types';
import type { ProgressiveSnapshotLease } from './snapshot-coordinator';

interface StartupScanHandlers {
  getPreferredRepoId: () => string;
  applySnapshot: (snapshot: AppSnapshot) => void;
  applyRepoUpdate: (update: RepoSnapshotUpdate) => void;
  reportError: (message: string | null) => void;
  isCurrent: () => boolean;
}

interface StartupScanCoordinator {
  beginProgressiveScan: () => ProgressiveSnapshotLease;
  requestRefresh: (settings: AppSettings, options?: SnapshotFetchOptions) => Promise<void>;
}

export function useProgressiveStartupScan(
  settings: AppSettings,
  selectedRepoId: string,
  applySnapshot: (snapshot: AppSnapshot) => void,
  applyRepoUpdate: (update: RepoSnapshotUpdate) => void,
  reportError: (message: string | null) => void,
  coordinator: StartupScanCoordinator,
) {
  const settingsRef = useRef(settings);
  const selectedRepoIdRef = useRef(selectedRepoId);
  const applySnapshotRef = useRef(applySnapshot);
  const applyRepoUpdateRef = useRef(applyRepoUpdate);
  const reportErrorRef = useRef(reportError);
  const coordinatorRef = useRef(coordinator);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    selectedRepoIdRef.current = selectedRepoId;
  }, [selectedRepoId]);

  useEffect(() => {
    applySnapshotRef.current = applySnapshot;
    applyRepoUpdateRef.current = applyRepoUpdate;
    reportErrorRef.current = reportError;
  }, [applySnapshot, applyRepoUpdate, reportError]);

  useEffect(() => {
    coordinatorRef.current = coordinator;
  }, [coordinator]);

  useEffect(() => {
    let active = true;
    const lease = coordinatorRef.current.beginProgressiveScan();
    reportErrorRef.current(null);

    void loadProgressiveStartupScan(settingsRef.current, coordinatorRef.current, {
      getPreferredRepoId: () => selectedRepoIdRef.current,
      applySnapshot: snapshot => {
        if (active) lease.applySnapshot(snapshot);
      },
      applyRepoUpdate: update => {
        if (active && lease.isCurrent()) applyRepoUpdateRef.current(update);
      },
      reportError: message => {
        if (active) lease.reportError(message);
      },
      isCurrent: () => active && lease.isCurrent(),
    }).catch(error => {
      if (!active) return;
      lease.reportError(error instanceof Error ? error.message : '启动扫描失败');
    });

    return () => {
      active = false;
    };
  }, [attempt]);

  return {
    retryStartupScan() {
      setAttempt(value => value + 1);
    },
  };
}

async function loadProgressiveStartupScan(
  settings: AppSettings,
  coordinator: StartupScanCoordinator,
  handlers: StartupScanHandlers,
) {
  const bootstrap = await fetchWorkspaceBootstrap(settings);
  if (!handlers.isCurrent()) return;
  const snapshot = buildBootstrapSnapshot(bootstrap);
  handlers.applySnapshot(snapshot);
  handlers.reportError(null);
  await scanRepos(snapshot, settings, handlers.getPreferredRepoId() || bootstrap.selectedRepoId, handlers);
  if (!handlers.isCurrent()) return;
  await coordinator.requestRefresh(settings, { refreshRemotes: true });
}

async function scanRepos(
  snapshot: AppSnapshot,
  settings: AppSettings,
  preferredRepoId: string,
  handlers: StartupScanHandlers,
) {
  const pendingTargets = orderStartupTargets(snapshot.repos, preferredRepoId);
  if (pendingTargets.length === 0) {
    return;
  }

  const workerCount = normalizeProgressiveConcurrency(settings.gitBehavior.concurrency, pendingTargets.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (handlers.isCurrent() && pendingTargets.length > 0) {
      const target = pendingTargets.shift();
      if (!target) return;
      const update = await loadProgressiveRepoUpdate(
        target,
        settings,
        snapshot.scannedAt,
        { fallbackDetail: snapshot.repoDetails[target.id] },
      );
      if (handlers.isCurrent()) handlers.applyRepoUpdate(update);
    }
  }));
}

function orderStartupTargets(repos: AppSnapshot['repos'], preferredRepoId: string) {
  return orderProgressiveTargets(repos, preferredRepoId);
}
