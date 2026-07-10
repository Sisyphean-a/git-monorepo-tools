import { useEffect, useRef, useState } from 'react';
import { fetchSnapshot, fetchWorkspaceBootstrap, refreshRepo } from './api';
import { buildBootstrapSnapshot } from './bootstrap-snapshot';
import { mergeRepoSnapshotUpdate } from './repo-snapshot-merge';
import type { AppSettings, AppSnapshot, Repo, RepoSnapshotUpdate } from './types';

interface StartupScanHandlers {
  getPreferredRepoId: () => string;
  applySnapshot: (snapshot: AppSnapshot) => void;
  reportError: (message: string | null) => void;
}

export function useProgressiveStartupScan(
  settings: AppSettings,
  selectedRepoId: string,
  applySnapshot: (snapshot: AppSnapshot) => void,
  reportError: (message: string | null) => void,
) {
  const settingsRef = useRef(settings);
  const selectedRepoIdRef = useRef(selectedRepoId);
  const applySnapshotRef = useRef(applySnapshot);
  const reportErrorRef = useRef(reportError);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    selectedRepoIdRef.current = selectedRepoId;
  }, [selectedRepoId]);

  useEffect(() => {
    applySnapshotRef.current = applySnapshot;
    reportErrorRef.current = reportError;
  }, [applySnapshot, reportError]);

  useEffect(() => {
    let active = true;
    reportErrorRef.current(null);

    void loadProgressiveStartupScan(settingsRef.current, {
      getPreferredRepoId: () => selectedRepoIdRef.current,
      applySnapshot: snapshot => {
        if (active) applySnapshotRef.current(snapshot);
      },
      reportError: message => {
        if (active) reportErrorRef.current(message);
      },
    }).catch(error => {
      if (!active) return;
      reportErrorRef.current(error instanceof Error ? error.message : '启动扫描失败');
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

async function loadProgressiveStartupScan(settings: AppSettings, handlers: StartupScanHandlers) {
  const bootstrap = await fetchWorkspaceBootstrap(settings);
  let snapshot = buildBootstrapSnapshot(bootstrap);
  handlers.applySnapshot(snapshot);
  handlers.reportError(null);
  snapshot = await scanRepos(snapshot, settings, handlers.getPreferredRepoId() || bootstrap.selectedRepoId, handlers);
  void refreshRemotesInBackground(settings, handlers);
}

async function scanRepos(
  snapshot: AppSnapshot,
  settings: AppSettings,
  preferredRepoId: string,
  handlers: StartupScanHandlers,
) {
  const pendingTargets = orderStartupTargets(snapshot.repos, preferredRepoId);
  if (pendingTargets.length === 0) {
    return snapshot;
  }

  let nextSnapshot = snapshot;
  const workerCount = normalizeStartupConcurrency(settings.gitBehavior.concurrency, pendingTargets.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (pendingTargets.length > 0) {
      const target = pendingTargets.shift();
      if (!target) return;
      const update = await loadStartupRepoUpdate(target, settings, snapshot);
      nextSnapshot = mergeRepoSnapshotUpdate(nextSnapshot, update);
      handlers.applySnapshot(nextSnapshot);
    }
  }));
  return nextSnapshot;
}

async function refreshRemotesInBackground(settings: AppSettings, handlers: StartupScanHandlers) {
  try {
    const snapshot = await fetchSnapshot(settings, { refreshRemotes: true });
    handlers.applySnapshot(snapshot);
  } catch {
  }
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
