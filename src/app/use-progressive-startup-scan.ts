import { useEffect, useRef, useState } from 'react';
import { fetchWorkspaceBootstrap, refreshRepo, type SnapshotFetchOptions } from './api';
import { buildBootstrapSnapshot } from './bootstrap-snapshot';
import type { AppSettings, AppSnapshot, Repo, RepoSnapshotUpdate } from './types';
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

  const workerCount = normalizeStartupConcurrency(settings.gitBehavior.concurrency, pendingTargets.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (handlers.isCurrent() && pendingTargets.length > 0) {
      const target = pendingTargets.shift();
      if (!target) return;
      const update = await loadStartupRepoUpdate(target, settings, snapshot);
      if (handlers.isCurrent()) handlers.applyRepoUpdate(update);
    }
  }));
}

async function loadStartupRepoUpdate(target: Repo, settings: AppSettings, snapshot: AppSnapshot) {
  try {
    return await refreshRepo(
      target.id,
      settings,
      { refreshRemotes: false },
      { path: target.path, category: target.category },
    );
  } catch (error) {
    return buildStartupErrorUpdate(snapshot, target.id, error);
  }
}

function orderStartupTargets(repos: Repo[], preferredRepoId: string) {
  if (!preferredRepoId) {
    return [...repos];
  }
  const preferred = repos.find(repo => repo.id === preferredRepoId);
  if (!preferred) {
    return [...repos];
  }
  return [preferred, ...repos.filter(repo => repo.id !== preferredRepoId)];
}

function normalizeStartupConcurrency(concurrency: number, repoCount: number) {
  if (repoCount <= 0) {
    return 0;
  }
  if (concurrency <= 0) {
    return Math.min(5, repoCount);
  }
  return Math.min(concurrency, repoCount);
}

function buildStartupErrorUpdate(snapshot: AppSnapshot, repoId: string, error: unknown): RepoSnapshotUpdate {
  const repo = snapshot.repoDetails[repoId];
  const message = error instanceof Error ? error.message : '仓库扫描失败';
  return {
    repo: {
      ...(repo ?? snapshot.repos.find(item => item.id === repoId)),
      id: repoId,
      status: 'error' as const,
      scanError: message,
    },
    commitCandidates: [],
    scannedAt: snapshot.scannedAt,
  };
}
