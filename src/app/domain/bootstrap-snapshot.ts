import type { AppSnapshot, Repo, RepoDetail, WorkspaceBootstrap } from './types.js';

export function buildBootstrapSnapshot(bootstrap: WorkspaceBootstrap): AppSnapshot {
  return {
    scannedAt: bootstrap.scannedAt,
    categories: bootstrap.categories,
    repos: bootstrap.repos,
    repoDetails: Object.fromEntries(
      bootstrap.repos.map(repo => [repo.id, createBootstrapRepoDetail(repo)]),
    ),
    selectedRepoId: bootstrap.selectedRepoId,
    pullResults: [],
    commitCandidates: {},
  };
}

function createBootstrapRepoDetail(repo: Repo): RepoDetail {
  return {
    ...repo,
    files: [],
    stagedCount: 0,
    unstagedCount: 0,
    scannedAt: '',
    history: [],
    historyTotal: 0,
    historyHasMore: false,
  };
}
