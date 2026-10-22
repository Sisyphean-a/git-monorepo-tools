import type { Repo } from './types.js';

export function favoriteRepos<T extends Repo>(repos: T[], favoriteRepoIds: string[]) {
  const reposById = new Map(repos.map(repo => [repo.id, repo]));
  return favoriteRepoIds.flatMap(repoId => {
    const repo = reposById.get(repoId);
    return repo ? [repo] : [];
  });
}

// Rule: 组星标以“任一成员已收藏”为已收藏；点击组星标整体取消或整体收藏。
export function toggleFavoriteRepoIds(favoriteRepoIds: string[], repoIds: string[]) {
  if (repoIds.length === 0) return favoriteRepoIds;
  const ids = new Set(repoIds);
  if (repoIds.some(id => favoriteRepoIds.includes(id))) {
    return favoriteRepoIds.filter(id => !ids.has(id));
  }
  return [...favoriteRepoIds, ...repoIds.filter(id => !favoriteRepoIds.includes(id))];
}

export function defaultRepoId(repos: Repo[], favoriteRepoIds: string[], fallbackRepoId: string) {
  return favoriteRepos(repos, favoriteRepoIds)[0]?.id ?? fallbackRepoId;
}
