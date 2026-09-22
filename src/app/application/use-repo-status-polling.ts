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
  /** 渐进启动扫描是否仍拥有 checking 项目；结束后轮询必须接管，避免仓库永久停在检查中。 */
  startupScanActive: boolean;
}

export function useRepoStatusPolling(config: RepoStatusPollingConfig) {
  const configRef = useRef(config);
  const inFlightRef = useRef(new Map<string, Promise<void>>());
  configRef.current = config;

  const enabled = config.settings.gitBehavior.autoScanEnabled;
  const repoIds = config.snapshot?.repos.map(repo => repo.id).join('\n') ?? '';
  const pendingRepoIds = config.snapshot?.repos.filter(repo => repo.status === 'checking').map(repo => repo.id).join('\n') ?? '';

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

  useEffect(() => {
    // Rule: 自动扫描关闭时，启动扫描中断留下的 checking 仓库仍需一次性补齐，不能永久停在检查中。
    if (enabled || config.startupScanActive || !pendingRepoIds) return;
    const concurrency = configRef.current.settings.gitBehavior.concurrency;
    void refreshRepoBatch(
      pendingRepoIds.split('\n'),
      concurrency,
      repoId => refreshRepo(repoId, configRef, inFlightRef),
    );
  }, [enabled, config.startupScanActive, pendingRepoIds]);
}

async function refreshRepo(
  repoId: string,
  configRef: { current: RepoStatusPollingConfig },
  inFlightRef: { current: Map<string, Promise<void>> },
) {
  const existing = inFlightRef.current.get(repoId);
  if (existing) return existing;

  const current = configRef.current;
  const target = readRepoRefreshTarget(current, repoId);
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

function readRepoRefreshTarget(config: RepoStatusPollingConfig, repoId: string): RepoRefreshTarget | undefined {
  const repo = config.snapshot?.repoDetails[repoId] ?? config.snapshot?.repos.find(item => item.id === repoId);
  // Rule: 渐进启动扫描拥有 checking 项目；扫描结束后轮询不得继续跳过它们。
  if (!repo || (repo.status === 'checking' && config.startupScanActive)) return undefined;
  return { path: repo.path, category: repo.category };
}
