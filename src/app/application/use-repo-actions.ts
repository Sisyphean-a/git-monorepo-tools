import { useState } from 'react';
import type { AppSettings, AppSnapshot, RepoLog, RepoMutationAction, RepoSnapshotUpdate } from '../domain/types';
import type { LocalRepoAction, WorkspaceBackend } from './ports';
import { viewRepoLog } from './repo-log';

type RunQueuedTask = <T>(task: () => Promise<T>, onSuccess?: (result: T) => void) => Promise<T>;

interface RepoActionsConfig {
  backend: WorkspaceBackend;
  settings: AppSettings;
  snapshot: AppSnapshot | null;
  runQueuedTask: RunQueuedTask;
  applyRepoUpdate: (update: RepoSnapshotUpdate) => void;
}

export function useRepoActions(config: RepoActionsConfig) {
  const [actionError, setActionError] = useState<string | null>(null);
  const [repoLog, setRepoLog] = useState<RepoLog | null>(null);
  const reportActionError = (error: unknown, fallback: string) => {
    setActionError(error instanceof Error ? error.message : fallback);
  };
  const actions = createRepoActions({ ...config, setActionError, setRepoLog, reportActionError });
  return { actionError, repoLog, closeRepoLog: () => setRepoLog(null), reportActionError, ...actions };
}

interface RepoActionContext extends RepoActionsConfig {
  setActionError: (value: string | null) => void;
  setRepoLog: (value: RepoLog | null) => void;
  reportActionError: (error: unknown, fallback: string) => void;
}

function createRepoActions(context: RepoActionContext) {
  const mutateRepo = (repoId: string, action: RepoMutationAction, body?: Record<string, unknown>) => (
    context.runQueuedTask(
      () => context.backend.mutateRepo(repoId, action, context.settings, body),
      context.applyRepoUpdate,
    )
  );
  const refreshWorkspace = (repoId: string) => context.runQueuedTask(
    () => context.backend.refreshRepo(
      repoId,
      context.settings,
      { refreshRemotes: false },
      readRepoRefreshTarget(context.snapshot, repoId),
    ),
    context.applyRepoUpdate,
  );
  return {
    mutateRepo,
    refreshWorkspace,
    invokeLocalRepoAction: (action: LocalRepoAction, path: string) => invokeLocalRepoAction(context, action, path),
    openRepoLog: (repoId: string) => viewRepoLog(repoId, context.settings, {
      onSuccess: context.setRepoLog,
      onError: context.setActionError,
      fetchLog: context.backend.fetchRepoLog,
    }),
    runRepoCommand: (repoPath: string, command: string, streamId?: string) => (
      context.backend.runRepoCommand({ repoPath, command, streamId, settings: context.settings })
    ),
  };
}

async function invokeLocalRepoAction(context: RepoActionContext, action: LocalRepoAction, path: string) {
  try {
    await context.backend.invokeLocalRepoAction(action, path);
    context.setActionError(null);
  } catch (error) {
    context.reportActionError(error, '本地操作失败');
    throw error;
  }
}

function readRepoRefreshTarget(snapshot: AppSnapshot | null, repoId: string) {
  const repo = snapshot?.repoDetails[repoId] ?? snapshot?.repos.find(item => item.id === repoId);
  return repo ? { path: repo.path, category: repo.category } : undefined;
}
