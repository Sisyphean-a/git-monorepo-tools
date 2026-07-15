import type { AppSettings, Repo, RepoDetail, RepoSnapshotUpdate } from '../domain/types.js';
import type { WorkspaceBackend } from './ports.js';

interface ProgressiveRepoScanRequest {
  target: Repo;
  settings: AppSettings;
  scannedAt: string;
  refreshRepo: WorkspaceBackend['refreshRepo'];
  fallbackDetail?: RepoDetail;
  refreshRemotes?: boolean;
}

export async function loadProgressiveRepoUpdate(request: ProgressiveRepoScanRequest) {
  const { target, settings, scannedAt, refreshRepo } = request;
  try {
    return await refreshRepo(
      target.id,
      settings,
      { refreshRemotes: request.refreshRemotes ?? false },
      { path: target.path, category: target.category },
    );
  } catch (error) {
    return buildProgressiveErrorUpdate(target, scannedAt, error, request.fallbackDetail);
  }
}

export function orderProgressiveTargets(repos: Repo[], preferredRepoId: string) {
  if (!preferredRepoId) {
    return [...repos];
  }
  const preferred = repos.find(repo => repo.id === preferredRepoId);
  if (!preferred) {
    return [...repos];
  }
  return [preferred, ...repos.filter(repo => repo.id !== preferredRepoId)];
}

export function normalizeProgressiveConcurrency(concurrency: number, repoCount: number) {
  if (repoCount <= 0) {
    return 0;
  }
  if (concurrency <= 0) {
    return Math.min(5, repoCount);
  }
  return Math.min(concurrency, repoCount);
}

function buildProgressiveErrorUpdate(
  target: Repo,
  scannedAt: string,
  error: unknown,
  fallbackDetail?: RepoDetail,
): RepoSnapshotUpdate {
  const message = error instanceof Error ? error.message : '仓库扫描失败';
  return {
    repo: {
      ...(fallbackDetail ?? createFallbackRepoDetail(target, scannedAt)),
      status: 'error',
      scanError: message,
    },
    commitCandidates: [],
    scannedAt,
  };
}

function createFallbackRepoDetail(target: Repo, scannedAt: string): RepoDetail {
  return {
    ...target,
    files: [],
    stagedCount: 0,
    unstagedCount: 0,
    scannedAt,
    history: [],
    historyTotal: 0,
    historyHasMore: false,
  };
}
