import { useState } from 'react';
import { mergeRepoSnapshotUpdate } from '../domain/repo-snapshot-merge';
import type { AppSettings, AppSnapshot, RepoSnapshotUpdate } from '../domain/types';
import type { WorkspaceBackend } from './ports';
import { useProgressiveStartupScan } from './use-progressive-startup-scan';
import { useSidebarScan } from './use-sidebar-scan';
import { useSnapshotRefresh } from './use-snapshot-refresh';

interface WorkspaceStateConfig {
  backend: WorkspaceBackend;
  settings: AppSettings;
}

export function useWorkspaceState({ backend, settings }: WorkspaceStateConfig) {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [selectedRepoId, setSelectedRepoId] = useState('');
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const sidebar = useSidebarScan({
    settings,
    selectedRepoId,
    reportError: setRefreshError,
    refreshRepo: backend.refreshRepo,
  });

  const applySnapshot = (nextSnapshot: AppSnapshot) => {
    setSnapshot(nextSnapshot);
    sidebar.syncSidebarSnapshot(nextSnapshot);
    setSelectedRepoId(current => nextSnapshot.repoDetails[current] ? current : nextSnapshot.selectedRepoId);
  };
  const applyRepoUpdate = (update: RepoSnapshotUpdate) => {
    setSnapshot(current => current ? mergeRepoSnapshotUpdate(current, update) : current);
    sidebar.applySidebarRepoUpdate(update);
    setSelectedRepoId(current => current || update.repo.id);
  };
  const refresh = useSnapshotRefresh({
    settings,
    applySnapshot,
    reportError: setRefreshError,
    fetchSnapshot: backend.fetchSnapshot,
    skipInitialRefresh: true,
  });
  const startup = useProgressiveStartupScan({
    settings,
    selectedRepoId,
    applySnapshot,
    applyRepoUpdate,
    reportError: setRefreshError,
    coordinator: refresh,
    backend,
  });

  return { snapshot, selectedRepoId, setSelectedRepoId, refreshError, sidebar, refresh, applyRepoUpdate, retryStartupScan: startup.retryStartupScan };
}
