import { useEffect, useRef, useState } from 'react';
import { loadProgressiveRepoUpdate, normalizeProgressiveConcurrency, orderProgressiveTargets } from './progressive-repo-scan';
import { buildSidebarSnapshot, mergeSidebarRepoUpdate, type SidebarSnapshot } from './sidebar-snapshot';
import type { AppSettings, AppSnapshot, RepoSnapshotUpdate } from './types';

export function useSidebarScan(
  settings: AppSettings,
  selectedRepoId: string,
  reportError: (message: string | null) => void,
) {
  const scanRevisionRef = useRef(0);
  const settingsRef = useRef(settings);
  const selectedRepoIdRef = useRef(selectedRepoId);
  const reportErrorRef = useRef(reportError);
  const snapshotRef = useRef<SidebarSnapshot | null>(null);
  const [sidebarSnapshot, setSidebarSnapshot] = useState<SidebarSnapshot | null>(null);
  const [sidebarRefreshing, setSidebarRefreshing] = useState(false);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    selectedRepoIdRef.current = selectedRepoId;
  }, [selectedRepoId]);

  useEffect(() => {
    reportErrorRef.current = reportError;
  }, [reportError]);

  const syncSidebarSnapshot = (snapshot: AppSnapshot) => {
    const next = buildSidebarSnapshot(snapshot);
    snapshotRef.current = next;
    setSidebarSnapshot(next);
  };

  const applySidebarRepoUpdate = (update: RepoSnapshotUpdate) => {
    setSidebarSnapshot(current => {
      if (!current) {
        return current;
      }
      const next = mergeSidebarRepoUpdate(current, update);
      snapshotRef.current = next;
      return next;
    });
  };

  const refreshSidebar = async () => {
    if (sidebarRefreshing || !snapshotRef.current) {
      return;
    }
    const revision = scanRevisionRef.current + 1;
    scanRevisionRef.current = revision;
    setSidebarRefreshing(true);
    reportErrorRef.current(null);
    try {
      await scanSidebarRepos(
        snapshotRef.current,
        settingsRef.current,
        selectedRepoIdRef.current,
        update => {
          if (scanRevisionRef.current === revision) {
            applySidebarRepoUpdate(update);
          }
        },
      );
      if (scanRevisionRef.current !== revision) {
        return;
      }
      void scanSidebarRepos(
        snapshotRef.current,
        settingsRef.current,
        selectedRepoIdRef.current,
        update => {
          if (scanRevisionRef.current === revision) {
            applySidebarRepoUpdate(update);
          }
        },
        { refreshRemotes: true },
      );
    } catch (error) {
      reportErrorRef.current(error instanceof Error ? error.message : '侧边栏扫描失败');
    } finally {
      if (scanRevisionRef.current === revision) {
        setSidebarRefreshing(false);
      }
    }
  };

  return {
    sidebarRefreshing,
    sidebarSnapshot,
    syncSidebarSnapshot,
    applySidebarRepoUpdate,
    refreshSidebar,
  };
}

async function scanSidebarRepos(
  snapshot: SidebarSnapshot,
  settings: AppSettings,
  selectedRepoId: string,
  applyRepoUpdate: (update: RepoSnapshotUpdate) => void,
  options: SidebarScanOptions = {},
) {
  const pendingTargets = orderProgressiveTargets(snapshot.repos, selectedRepoId);
  const workerCount = normalizeProgressiveConcurrency(settings.gitBehavior.concurrency, pendingTargets.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (pendingTargets.length > 0) {
      const target = pendingTargets.shift();
      if (!target) {
        return;
      }
      const update = await loadProgressiveRepoUpdate(target, settings, snapshot.scannedAt, options);
      applyRepoUpdate(update);
    }
  }));
}

type SidebarScanOptions = {
  refreshRemotes?: boolean;
};
