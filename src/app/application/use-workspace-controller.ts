import { useState } from 'react';
import type { AppSettings } from '../domain/types';
import type { SettingsStore, WorkspaceBackend } from './ports';
import { createSettingsActions } from './settings-actions';
import { useRepoActions } from './use-repo-actions';
import { useWorkspaceState } from './use-workspace-state';

interface WorkspaceControllerDependencies {
  backend: WorkspaceBackend;
  settingsStore: SettingsStore;
}

export function useWorkspaceController({ backend, settingsStore }: WorkspaceControllerDependencies) {
  const [settings, setSettings] = useState<AppSettings>(() => settingsStore.loadSettings());
  const workspace = useWorkspaceState({ backend, settings });
  const repoActions = useRepoActions({
    backend,
    settings,
    snapshot: workspace.snapshot,
    runQueuedTask: workspace.refresh.runQueuedTask,
    applyRepoUpdate: workspace.applyRepoUpdate,
  });
  const settingsActions = createSettingsActions({
    backend,
    settingsStore,
    settings,
    setSettings,
    snapshot: workspace.snapshot,
    refreshSnapshot: workspace.refresh.refreshSnapshot,
    reportError: repoActions.reportActionError,
  });

  return {
    snapshot: workspace.snapshot,
    selectedRepoId: workspace.selectedRepoId,
    setSelectedRepoId: workspace.setSelectedRepoId,
    settings,
    visibleError: repoActions.actionError ?? workspace.refreshError,
    repoLog: repoActions.repoLog,
    closeRepoLog: repoActions.closeRepoLog,
    sidebar: workspace.sidebar,
    retryStartupScan: workspace.retryStartupScan,
    runQueuedTask: workspace.refresh.runQueuedTask,
    applyRepoUpdate: workspace.applyRepoUpdate,
    ...settingsActions,
    mutateRepo: repoActions.mutateRepo,
    refreshWorkspace: repoActions.refreshWorkspace,
    invokeLocalRepoAction: repoActions.invokeLocalRepoAction,
    openRepoLog: repoActions.openRepoLog,
    runRepoCommand: repoActions.runRepoCommand,
    reportActionError: repoActions.reportActionError,
  };
}
