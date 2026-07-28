import type { Repo } from './types.js';

export function favoriteRepos<T extends Repo>(repos: T[], favoriteRepoIds: string[]) {
  const reposById = new Map(repos.map(repo => [repo.id, repo]));
  return favoriteRepoIds.flatMap(repoId => {
    const repo = reposById.get(repoId);
    return repo ? [repo] : [];
  });
}

export function nonFavoriteRepos<T extends Repo>(repos: T[], favoriteRepoIds: string[]) {
  const favoriteIds = new Set(favoriteRepoIds);
  return repos.filter(repo => !favoriteIds.has(repo.id));
}

export function defaultRepoId(repos: Repo[], favoriteRepoIds: string[], fallbackRepoId: string) {
  return favoriteRepos(repos, favoriteRepoIds)[0]?.id ?? fallbackRepoId;
}
