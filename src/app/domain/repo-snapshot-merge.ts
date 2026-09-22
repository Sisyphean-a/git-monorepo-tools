import type { AppSnapshot, FileChange, Repo, RepoDetail, RepoSnapshotUpdate } from './types.js';

export type RepoUpdateMode = 'interaction' | 'background';

export type SnapshotApplyContext = {
  /** 完整快照 fetch 开始时的交互版本；版本更高的仓库以本地交互结果为准，避免旧快照回退前台操作。 */
  preserveInteractionsSince: number;
};

export function mergeRepoSnapshotUpdate(
  snapshot: AppSnapshot,
  update: RepoSnapshotUpdate,
  mode: RepoUpdateMode = 'interaction',
  historyRevision = update.scannedAt,
): AppSnapshot {
  const incomingRepo = update.repo;
  const nextRepo = mergeRepoDetail(snapshot.repoDetails[incomingRepo.id], incomingRepo, mode, historyRevision);
  const repoDetails = {
    ...snapshot.repoDetails,
    [nextRepo.id]: nextRepo,
  };
  const repos = replaceRepoInList(snapshot.repos, toRepoSummary(nextRepo));

  return {
    ...snapshot,
    // Rule: 单仓更新不改变工作区扫描时间，避免轮询把“上次扫描”刷新成当前时间。
    repos,
    repoDetails,
    selectedRepoId: snapshot.selectedRepoId || nextRepo.id,
    commitCandidates: {
      ...snapshot.commitCandidates,
      [nextRepo.id]: update.commitCandidates,
    },
  };
}

export function replaceRepoInList<T extends Repo>(repos: T[], nextRepo: T) {
  return repos.map(repo => (repo.id === nextRepo.id ? nextRepo : repo));
}

// Flow: 完整快照作为列表组成的权威来源（新增/移除仓库生效），但 fetch 期间发生交互更新的仓库保留本地版本。
// Guarantee: 不存在的仓库一律以快照为准删除；scannedAt 只取完整快照时间。
export function mergeSnapshotPreservingInteractions(
  next: AppSnapshot,
  current: AppSnapshot | null,
  interactionVersions: ReadonlyMap<string, number>,
  preserveInteractionsSince: number,
): AppSnapshot {
  if (!current || interactionVersions.size === 0) return next;
  const preserved = new Map<string, RepoDetail>();
  for (const repo of next.repos) {
    const version = interactionVersions.get(repo.id);
    const detail = current.repoDetails[repo.id];
    if (version !== undefined && version > preserveInteractionsSince && detail) {
      preserved.set(repo.id, detail);
    }
  }
  if (preserved.size === 0) return next;

  const repos = next.repos.map(repo => {
    const detail = preserved.get(repo.id);
    return detail ? toRepoSummary(detail) : repo;
  });
  const repoDetails = { ...next.repoDetails };
  const commitCandidates = { ...next.commitCandidates };
  for (const [repoId, detail] of preserved) {
    repoDetails[repoId] = detail;
    const candidates = current.commitCandidates[repoId];
    if (candidates) commitCandidates[repoId] = candidates;
  }
  return { ...next, repos, repoDetails, commitCandidates };
}

export function toRepoSummary(repo: Repo): Repo {
  return {
    id: repo.id,
    name: repo.name,
    branch: repo.branch,
    headRevision: repo.headRevision,
    path: repo.path,
    remote: repo.remote,
    category: repo.category,
    modified: repo.modified,
    ahead: repo.ahead,
    behind: repo.behind,
    conflicts: repo.conflicts,
    status: repo.status,
    scanError: repo.scanError,
    lastScan: repo.lastScan,
  };
}

function mergeRepoDetail(current: RepoDetail | undefined, incoming: RepoDetail, mode: RepoUpdateMode, revision: string): RepoDetail {
  if (!current) return { ...incoming, historyRevision: revision };
  const headChanged = Boolean(current.headRevision && incoming.headRevision && current.headRevision !== incoming.headRevision);
  const next = {
    ...incoming,
    files: reconcileFiles(current.files, incoming.files),
    historyRevision: mode === 'background'
      ? headChanged ? `head-${incoming.headRevision}` : current.historyRevision
      : revision,
  };
  if (mode === 'interaction' || headChanged) return next;
  return {
    ...next,
    // Equivalent background status snapshots do not own history. Preserve the active reading session.
    history: current.history,
    historyTotal: current.historyTotal,
    historyHasMore: current.historyHasMore,
  };
}

function reconcileFiles(current: FileChange[], incoming: FileChange[]) {
  const currentById = new Map(current.map(file => [file.id, file]));
  let changed = current.length !== incoming.length;
  const next = incoming.map((file, index) => {
    const previous = currentById.get(file.id);
    if (previous && sameFileChange(previous, file)) {
      if (current[index] !== previous) changed = true;
      return previous;
    }
    changed = true;
    return file;
  });
  return changed ? next : current;
}

function sameFileChange(left: FileChange, right: FileChange) {
  return left.id === right.id
    && left.path === right.path
    && left.status === right.status
    && left.staged === right.staged
    && Boolean(left.untracked) === Boolean(right.untracked)
    && left.additions === right.additions
    && left.deletions === right.deletions
    && left.size === right.size
    && left.sizeBytes === right.sizeBytes
    && left.previousSize === right.previousSize
    && left.previousSizeBytes === right.previousSizeBytes;
}
