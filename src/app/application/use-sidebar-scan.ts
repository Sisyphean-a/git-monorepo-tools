import { useEffect, useRef, useState } from 'react';
import { loadProgressiveRepoUpdate, normalizeProgressiveConcurrency, orderProgressiveTargets } from './progressive-repo-scan';
import { buildSidebarSnapshot, mergeSidebarRepoUpdate, type SidebarSnapshot } from '../domain/sidebar-snapshot';
import type { AppSettings, AppSnapshot, RepoSnapshotUpdate } from '../domain/types';
import type { WorkspaceBackend } from './ports';

interface SidebarScanConfig {
  settings: AppSettings;
  selectedRepoId: string;
  reportError: (message: string | null) => void;
  refreshRepo: WorkspaceBackend['refreshRepo'];
}

export function useSidebarScan(config: SidebarScanConfig) {
  const { settings, selectedRepoId, reportError, refreshRepo } = config;
  const scanRevisionRef = useRef(0);
  const settingsRef = useRef(settings);
  const selectedRepoIdRef = useRef(selectedRepoId);
  const reportErrorRef = useRef(reportError);
  const snapshotRef = useRef<SidebarSnapshot | null>(null);
  const refreshRepoRef = useRef(refreshRepo);
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
    refreshRepoRef.current = refreshRepo;
  }, [refreshRepo, reportError]);

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
      await scanSidebarRepos({
        snapshot: snapshotRef.current,
        settings: settingsRef.current,
        selectedRepoId: selectedRepoIdRef.current,
        refreshRepo: refreshRepoRef.current,
        applyRepoUpdate: update => {
          if (scanRevisionRef.current === revision) {
            applySidebarRepoUpdate(update);
          }
        },
      });
      if (scanRevisionRef.current !== revision) {
        return;
      }
      void scanSidebarRepos({
        snapshot: snapshotRef.current,
        settings: settingsRef.current,
        selectedRepoId: selectedRepoIdRef.current,
        refreshRepo: refreshRepoRef.current,
        applyRepoUpdate: update => {
          if (scanRevisionRef.current === revision) {
            applySidebarRepoUpdate(update);
          }
        },
        refreshRemotes: true,
      });
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

interface SidebarScanRequest {
  snapshot: SidebarSnapshot;
  settings: AppSettings;
  selectedRepoId: string;
  applyRepoUpdate: (update: RepoSnapshotUpdate) => void;
  refreshRepo: WorkspaceBackend['refreshRepo'];
  refreshRemotes?: boolean;
}

async function scanSidebarRepos(request: SidebarScanRequest) {
  const { snapshot, settings, selectedRepoId, applyRepoUpdate, refreshRepo, refreshRemotes = false } = request;
  const pendingTargets = orderProgressiveTargets(snapshot.repos, selectedRepoId);
  const workerCount = normalizeProgressiveConcurrency(settings.gitBehavior.concurrency, pendingTargets.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (pendingTargets.length > 0) {
      const target = pendingTargets.shift();
      if (!target) {
        return;
      }
      const update = await loadProgressiveRepoUpdate({
        target,
        settings,
        scannedAt: snapshot.scannedAt,
        refreshRepo,
        refreshRemotes,
      });
      applyRepoUpdate(update);
    }
  }));
}
