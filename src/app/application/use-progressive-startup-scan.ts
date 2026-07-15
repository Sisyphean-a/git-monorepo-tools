import { useEffect, useRef, useState } from 'react';
import { buildBootstrapSnapshot } from '../domain/bootstrap-snapshot.js';
import { loadProgressiveRepoUpdate, normalizeProgressiveConcurrency, orderProgressiveTargets } from './progressive-repo-scan.js';
import type { AppSettings, AppSnapshot, RepoSnapshotUpdate } from '../domain/types.js';
import type { ProgressiveSnapshotLease } from './snapshot-coordinator.js';
import type { SnapshotFetchOptions, WorkspaceBackend } from './ports.js';

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

interface ProgressiveStartupScanConfig {
  settings: AppSettings;
  selectedRepoId: string;
  applySnapshot: (snapshot: AppSnapshot) => void;
  applyRepoUpdate: (update: RepoSnapshotUpdate) => void;
  reportError: (message: string | null) => void;
  coordinator: StartupScanCoordinator;
  backend: Pick<WorkspaceBackend, 'fetchWorkspaceBootstrap' | 'refreshRepo'>;
}

export function useProgressiveStartupScan(config: ProgressiveStartupScanConfig) {
  const { settings, selectedRepoId, applySnapshot, applyRepoUpdate, reportError, coordinator, backend } = config;
  const settingsRef = useRef(settings);
  const selectedRepoIdRef = useRef(selectedRepoId);
  const applySnapshotRef = useRef(applySnapshot);
  const applyRepoUpdateRef = useRef(applyRepoUpdate);
  const reportErrorRef = useRef(reportError);
  const coordinatorRef = useRef(coordinator);
  const backendRef = useRef(backend);
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
    backendRef.current = backend;
  }, [backend, coordinator]);

  useEffect(() => {
    let active = true;
    const lease = coordinatorRef.current.beginProgressiveScan();
    reportErrorRef.current(null);

    void loadProgressiveStartupScan({
      settings: settingsRef.current,
      coordinator: coordinatorRef.current,
      backend: backendRef.current,
      handlers: {
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
      },
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

interface ProgressiveStartupScanRequest {
  settings: AppSettings;
  coordinator: StartupScanCoordinator;
  backend: Pick<WorkspaceBackend, 'fetchWorkspaceBootstrap' | 'refreshRepo'>;
  handlers: StartupScanHandlers;
}

export async function loadProgressiveStartupScan(request: ProgressiveStartupScanRequest) {
  const { settings, coordinator, backend, handlers } = request;
  const bootstrap = await backend.fetchWorkspaceBootstrap(settings);
  if (!handlers.isCurrent()) return;
  const snapshot = buildBootstrapSnapshot(bootstrap);
  handlers.applySnapshot(snapshot);
  handlers.reportError(null);
  await scanRepos({
    snapshot,
    settings,
    preferredRepoId: handlers.getPreferredRepoId() || bootstrap.selectedRepoId,
    handlers,
    refreshRepo: backend.refreshRepo,
  });
  if (!handlers.isCurrent()) return;
  await coordinator.requestRefresh(settings, { refreshRemotes: true });
}

interface ScanReposRequest {
  snapshot: AppSnapshot;
  settings: AppSettings;
  preferredRepoId: string;
  handlers: StartupScanHandlers;
  refreshRepo: WorkspaceBackend['refreshRepo'];
}

async function scanRepos(request: ScanReposRequest) {
  const { snapshot, settings, preferredRepoId, handlers, refreshRepo } = request;
  const pendingTargets = orderStartupTargets(snapshot.repos, preferredRepoId);
  if (pendingTargets.length === 0) {
    return;
  }

  const workerCount = normalizeProgressiveConcurrency(settings.gitBehavior.concurrency, pendingTargets.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (handlers.isCurrent() && pendingTargets.length > 0) {
      const target = pendingTargets.shift();
      if (!target) return;
      const update = await loadProgressiveRepoUpdate({
        target,
        settings,
        scannedAt: snapshot.scannedAt,
        refreshRepo,
        fallbackDetail: snapshot.repoDetails[target.id],
      });
      if (handlers.isCurrent()) handlers.applyRepoUpdate(update);
    }
  }));
}

function orderStartupTargets(repos: AppSnapshot['repos'], preferredRepoId: string) {
  return orderProgressiveTargets(repos, preferredRepoId);
}
