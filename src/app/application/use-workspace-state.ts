import { useRef, useState } from 'react';
import { mergeRepoSnapshotUpdate, mergeSnapshotPreservingInteractions, type SnapshotApplyContext } from '../domain/repo-snapshot-merge';
import type { AppSettings, AppSnapshot, RepoSnapshotUpdate } from '../domain/types';
import type { WorkspaceBackend } from './ports';
import { useProgressiveStartupScan } from './use-progressive-startup-scan';
import { useRepoStatusPolling } from './use-repo-status-polling';
import { useSidebarScan } from './use-sidebar-scan';
import { useSnapshotRefresh } from './use-snapshot-refresh';

interface WorkspaceStateConfig {
  backend: WorkspaceBackend;
  settings: AppSettings;
}

export function useWorkspaceState({ backend, settings }: WorkspaceStateConfig) {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [selectedRepoId, setSelectedRepoId] = useState('');
  const interactionRevisionRef = useRef(0);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const snapshotRef = useRef<AppSnapshot | null>(null);
  const interactionVersionsRef = useRef(new Map<string, number>());

  const applySnapshot = (nextSnapshot: AppSnapshot, context?: SnapshotApplyContext) => {
    // Rule: 完整快照决定列表组成；fetch 期间发生的交互结果按仓库版本保留，避免旧状态回退前台操作。
    const merged = context
      ? mergeSnapshotPreservingInteractions(
        nextSnapshot,
        snapshotRef.current,
        interactionVersionsRef.current,
        context.preserveInteractionsSince,
      )
      : nextSnapshot;
    snapshotRef.current = merged;
    setSnapshot(merged);
    sidebar.syncSidebarSnapshot(merged);
    setSelectedRepoId(current => merged.repoDetails[current] ? current : merged.selectedRepoId);
  };
  const applyRepoUpdate = (update: RepoSnapshotUpdate) => {
    interactionRevisionRef.current += 1;
    interactionVersionsRef.current.set(update.repo.id, interactionRevisionRef.current);
    const historyRevision = `interaction-${interactionRevisionRef.current}`;
    const currentSnapshot = snapshotRef.current;
    const next = currentSnapshot ? mergeRepoSnapshotUpdate(currentSnapshot, update, 'interaction', historyRevision) : currentSnapshot;
    snapshotRef.current = next;
    setSnapshot(next);
    sidebar.applySidebarRepoUpdate(update);
    setSelectedRepoId(current => current || update.repo.id);
  };
  const applyBackgroundRepoUpdate = (update: RepoSnapshotUpdate) => {
    const currentSnapshot = snapshotRef.current;
    const next = currentSnapshot ? mergeRepoSnapshotUpdate(currentSnapshot, update, 'background') : currentSnapshot;
    snapshotRef.current = next;
    setSnapshot(next);
    sidebar.applySidebarRepoUpdate(update);
    setSelectedRepoId(current => current || update.repo.id);
  };
  const refresh = useSnapshotRefresh({
    settings,
    applySnapshot,
    reportError: setRefreshError,
    fetchSnapshot: backend.fetchSnapshot,
    readRepoUpdateRevision: () => interactionRevisionRef.current,
    skipInitialRefresh: true,
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
