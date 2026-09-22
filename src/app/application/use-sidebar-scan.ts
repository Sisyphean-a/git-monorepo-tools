import { useEffect, useRef, useState } from 'react';
import { buildSidebarSnapshot, mergeSidebarRepoUpdate, type SidebarSnapshot } from '../domain/sidebar-snapshot.js';
import type { AppSettings, AppSnapshot, RepoSnapshotUpdate } from '../domain/types.js';
import type { SnapshotFetchOptions } from './ports.js';

interface SidebarScanConfig {
  settings: AppSettings;
  reportError: (message: string | null) => void;
  refreshSnapshot: (settings: AppSettings, options?: SnapshotFetchOptions) => Promise<void>;
}

export function useSidebarScan(config: SidebarScanConfig) {
  const { settings, reportError, refreshSnapshot } = config;
  const settingsRef = useRef(settings);
  const reportErrorRef = useRef(reportError);
  const refreshSnapshotRef = useRef(refreshSnapshot);
  const [sidebarSnapshot, setSidebarSnapshot] = useState<SidebarSnapshot | null>(null);

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

  // Flow: 手动扫描只负责发起完整刷新；进行中状态由 useSnapshotRefresh 统一暴露，重复点击由刷新队列合并。
  const refreshSidebar = async () => {
    reportErrorRef.current(null);
    try {
      await refreshSnapshotRef.current(settingsRef.current, { refreshRemotes: true });
    } catch (error) {
      reportErrorRef.current(error instanceof Error ? error.message : '侧边栏扫描失败');
    }
  };

  return {
    sidebarSnapshot,
    syncSidebarSnapshot,
    applySidebarRepoUpdate,
    refreshSidebar,
  };
}
