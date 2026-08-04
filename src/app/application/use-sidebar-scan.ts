import { useEffect, useRef, useState } from 'react';
import { buildSidebarSnapshot, mergeSidebarRepoUpdate, type SidebarSnapshot } from '../domain/sidebar-snapshot.js';
import type { AppSettings, AppSnapshot, RepoSnapshotUpdate } from '../domain/types.js';

interface SidebarScanConfig {
  settings: AppSettings;
  reportError: (message: string | null) => void;
  refreshSnapshot: (settings: AppSettings) => Promise<void>;
}

export function useSidebarScan(config: SidebarScanConfig) {
  const { settings, reportError, refreshSnapshot } = config;
  const settingsRef = useRef(settings);
  const reportErrorRef = useRef(reportError);
  const refreshSnapshotRef = useRef(refreshSnapshot);
  const [sidebarSnapshot, setSidebarSnapshot] = useState<SidebarSnapshot | null>(null);
  const [sidebarRefreshing, setSidebarRefreshing] = useState(false);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    reportErrorRef.current = reportError;
    refreshSnapshotRef.current = refreshSnapshot;
  }, [refreshSnapshot, reportError]);

  const syncSidebarSnapshot = (snapshot: AppSnapshot) => {
    setSidebarSnapshot(buildSidebarSnapshot(snapshot));
  };

  const applySidebarRepoUpdate = (update: RepoSnapshotUpdate) => {
    setSidebarSnapshot(current => current ? mergeSidebarRepoUpdate(current, update) : current);
  };

  const refreshSidebar = async () => {
    if (sidebarRefreshing) return;
    setSidebarRefreshing(true);
    reportErrorRef.current(null);
    try {
      await refreshSnapshotRef.current(settingsRef.current);
    } catch (error) {
      reportErrorRef.current(error instanceof Error ? error.message : '侧边栏扫描失败');
    } finally {
      setSidebarRefreshing(false);
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
