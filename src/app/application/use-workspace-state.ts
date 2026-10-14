import { useRef, useState } from 'react';
import type { SnapshotApplyContext } from '../domain/repo-snapshot-merge';
import { createWorkspaceSnapshotState } from './workspace-snapshot-state';
import type { AppSettings, AppSnapshot, RepoSnapshotUpdate } from '../domain/types';
import type { WorkspaceBackend } from './ports';
import { useProgressiveStartupScan } from './use-progressive-startup-scan';
import { useRepoStatusPolling } from './use-repo-status-polling';
import { useSidebarScan } from './use-sidebar-scan';
import { useSnapshotRefresh } from './use-snapshot-refresh';
import { useWindowActivity } from './use-window-activity';

interface WorkspaceStateConfig {
  backend: WorkspaceBackend;
  settings: AppSettings;
}

export function useWorkspaceState({ backend, settings }: WorkspaceStateConfig) {
  const windowActive = useWindowActivity();
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [selectedRepoId, setSelectedRepoId] = useState('');
  const stateRef = useRef<ReturnType<typeof createWorkspaceSnapshotState> | null>(null);
  stateRef.current ??= createWorkspaceSnapshotState();
  const state = stateRef.current;
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const applySnapshot = (nextSnapshot: AppSnapshot, context?: SnapshotApplyContext) => {
    const merged = state.applySnapshot(nextSnapshot, context);
    setSnapshot(merged);
    sidebar.syncSidebarSnapshot(merged);
    setSelectedRepoId(current => merged.repoDetails[current] ? current : merged.selectedRepoId);
  };
  const applyRepoUpdate = (update: RepoSnapshotUpdate) => {
    setSnapshot(state.applyInteraction(update));
    sidebar.applySidebarRepoUpdate(update);
    setSelectedRepoId(current => current || update.repo.id);
  };
  const applyBackgroundRepoUpdate = (update: RepoSnapshotUpdate, context?: SnapshotApplyContext) => {
    const next = state.applyBackground(update, context);
    if (!next) return;
    setSnapshot(next);
    sidebar.applySidebarRepoUpdate(update);
    setSelectedRepoId(current => current || update.repo.id);
  };
  const refresh = useSnapshotRefresh({
    settings,
    applySnapshot,
    applyRepoUpdate: applyBackgroundRepoUpdate,
    reportError: setRefreshError,
    fetchSnapshot: backend.fetchSnapshot,
    refreshRepo: backend.refreshRepo,
    readRepoUpdateRevision: state.readRepoUpdateRevision,
    skipInitialRefresh: true,
    windowActive,
  });
  const sidebar = useSidebarScan({
    settings,
    reportError: setRefreshError,
    refreshSnapshot: refresh.refreshSnapshot,
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
  useRepoStatusPolling({
    backend,
    settings,
    snapshot,
    selectedRepoId,
    applyRepoUpdate: applyBackgroundRepoUpdate,
    runBackgroundTask: refresh.runBackgroundTask,
    startupScanActive: startup.startupScanActive,
    windowActive,
  });

  return {
    snapshot,
    selectedRepoId,
    setSelectedRepoId,
    refreshError,
    sidebar,
    refresh,
    refreshing: refresh.refreshing,
    applyRepoUpdate,
    retryStartupScan: startup.retryStartupScan,
  };
}
