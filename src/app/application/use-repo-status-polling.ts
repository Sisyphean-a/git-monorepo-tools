import { useEffect, useRef } from 'react';
import type { AppSettings, AppSnapshot, RepoSnapshotUpdate } from '../domain/types';
import type { RepoRefreshTarget, WorkspaceBackend } from './ports';

const ACTIVE_REPO_INTERVAL_MS = 2_000;
const BACKGROUND_REPOS_INTERVAL_MS = 10_000;

type RunBackgroundTask = <T>(task: () => Promise<T>, onSuccess?: (result: T) => void) => Promise<T>;

interface RepoStatusPollingConfig {
  backend: Pick<WorkspaceBackend, 'refreshRepo'>;
  settings: AppSettings;
  snapshot: AppSnapshot | null;
  selectedRepoId: string;
  applyRepoUpdate: (update: RepoSnapshotUpdate) => void;
  runBackgroundTask: RunBackgroundTask;
}

export function useRepoStatusPolling(config: RepoStatusPollingConfig) {
  const configRef = useRef(config);
  const inFlightRef = useRef(new Map<string, Promise<void>>());
  configRef.current = config;

  const enabled = config.settings.gitBehavior.autoScanEnabled;
  const repoIds = config.snapshot?.repos.map(repo => repo.id).join('\n') ?? '';

  useEffect(() => {
    if (!enabled || !config.selectedRepoId) return;
    const refreshActiveRepo = () => {
      void refreshRepo(config.selectedRepoId, configRef, inFlightRef);
    };

    refreshActiveRepo();
    const timer = window.setInterval(refreshActiveRepo, ACTIVE_REPO_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [enabled, config.selectedRepoId]);

  useEffect(() => {
    if (!enabled || !repoIds) return;
    let running = false;
    const refreshBackgroundRepos = () => {
      if (running) return;
      const current = configRef.current;
      const ids = current.snapshot?.repos
        .map(repo => repo.id)
        .filter(repoId => repoId !== current.selectedRepoId) ?? [];
      running = true;
      void refreshRepoBatch(
        ids,
        current.settings.gitBehavior.concurrency,
        repoId => refreshRepo(repoId, configRef, inFlightRef),
      ).finally(() => {
        running = false;
      });
    };

    const timer = window.setInterval(refreshBackgroundRepos, BACKGROUND_REPOS_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [enabled, repoIds]);
}

async function refreshRepo(
  repoId: string,
  configRef: { current: RepoStatusPollingConfig },
  inFlightRef: { current: Map<string, Promise<void>> },
) {
  const existing = inFlightRef.current.get(repoId);
  if (existing) return existing;

  const current = configRef.current;
  const target = readRepoRefreshTarget(current.snapshot, repoId);
  if (!target) return;

  const request = current.runBackgroundTask(
    () => current.backend.refreshRepo(repoId, current.settings, { refreshRemotes: false }, target),
    current.applyRepoUpdate,
  ).then(() => undefined, () => undefined);
  inFlightRef.current.set(repoId, request);
  await request;
  if (inFlightRef.current.get(repoId) === request) inFlightRef.current.delete(repoId);
}

async function refreshRepoBatch(
  repoIds: string[],
  concurrency: number,
  refresh: (repoId: string) => Promise<void>,
) {
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, concurrency), repoIds.length) }, async () => {
    while (nextIndex < repoIds.length) {
      const repoId = repoIds[nextIndex];
      nextIndex += 1;
      if (repoId) await refresh(repoId);
    }
  });
  await Promise.all(workers);
}

function readRepoRefreshTarget(snapshot: AppSnapshot | null, repoId: string): RepoRefreshTarget | undefined {
  const repo = snapshot?.repoDetails[repoId] ?? snapshot?.repos.find(item => item.id === repoId);
  // Rule: 渐进启动扫描拥有 checking 项目，轮询不得用并发旧结果覆盖它。
  if (!repo || repo.status === 'checking') return undefined;
  return { path: repo.path, category: repo.category };
}
