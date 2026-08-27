import type { AppSnapshot, FileChange, Repo, RepoDetail, RepoSnapshotUpdate } from './types.js';

export type RepoUpdateMode = 'interaction' | 'background';

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
    scannedAt: update.scannedAt,
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
