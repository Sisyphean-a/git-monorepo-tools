import type { AppSnapshot, Repo, RepoSnapshotUpdate } from './types.js';

export function mergeRepoSnapshotUpdate(snapshot: AppSnapshot, update: RepoSnapshotUpdate): AppSnapshot {
  const nextRepo = update.repo;
  const repoDetails = {
    ...snapshot.repoDetails,
    [nextRepo.id]: nextRepo,
  };
  const repos = replaceRepoInList(snapshot.repos, nextRepo);

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
