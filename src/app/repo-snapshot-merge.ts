import type { AppSnapshot, RepoSnapshotUpdate } from './types.js';

export function mergeRepoSnapshotUpdate(snapshot: AppSnapshot, update: RepoSnapshotUpdate): AppSnapshot {
  const nextRepo = update.repo;
  const pinnedRepoPath = snapshot.repos[0]?.path ?? '';
  const repoDetails = {
    ...snapshot.repoDetails,
    [nextRepo.id]: nextRepo,
  };
  const repos = snapshot.repos
    .map(repo => (repo.id === nextRepo.id ? nextRepo : repo))
    .sort((left, right) => compareRepos(left, right, pinnedRepoPath));

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

function compareRepos(left: AppSnapshot['repos'][number], right: AppSnapshot['repos'][number], pinnedRepoPath: string) {
  if (pinnedRepoPath) {
    if (left.path === pinnedRepoPath) return -1;
    if (right.path === pinnedRepoPath) return 1;
  }
  if (left.modified !== right.modified) return right.modified - left.modified;
  if (left.name !== right.name) return left.name.localeCompare(right.name);
  return left.path.localeCompare(right.path);
}
