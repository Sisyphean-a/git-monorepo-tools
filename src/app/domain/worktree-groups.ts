import type { Repo, RepoStatus } from './types.js';

export interface WorktreeGroup {
  id: string;
  name: string;
  category: string;
  repos: Repo[];
  mainRepo?: Repo;
  representativeId: string;
  /** 搜索过滤后仍保留完整成员数，用于决定是否显示组行。 */
  total: number;
}

const statusPriority: Record<RepoStatus, number> = {
  clean: 0,
  checking: 1,
  changed: 2,
  error: 3,
  conflict: 4,
};

export function worktreeGroupId(repo: Repo) {
  return repo.worktreeGroupId || repo.id;
}

export function groupReposByWorktree(repos: Repo[]): WorktreeGroup[] {
  const grouped = new Map<string, Repo[]>();
  for (const repo of repos) {
    const id = worktreeGroupId(repo);
    const members = grouped.get(id);
    if (members) {
      members.push(repo);
    } else {
      grouped.set(id, [repo]);
    }
  }

  const groups: WorktreeGroup[] = [];
  for (const [id, members] of grouped) {
    const group = createWorktreeGroup(id, members);
    if (group) groups.push(group);
  }
  return groups.sort((left, right) => left.name.localeCompare(right.name));
}

export function matchesRepoSearch(repo: Repo, query: string) {
  const value = query.trim().toLowerCase();
  if (!value) return true;
  return (
    repo.name.toLowerCase().includes(value)
    || repo.branch.toLowerCase().includes(value)
    || repo.path.toLowerCase().includes(value)
  );
}

// Flow: 搜索命中组名或主工作树路径时展示整组；只命中子工作树时只保留命中的成员。
export function filterWorktreeGroups(groups: WorktreeGroup[], search: string): WorktreeGroup[] {
  const query = search.trim().toLowerCase();
  if (!query) return groups;

  const filtered: WorktreeGroup[] = [];
  for (const group of groups) {
    const groupMatches = group.name.toLowerCase().includes(query)
      || Boolean(group.mainRepo?.path.toLowerCase().includes(query));
    const repos = groupMatches ? group.repos : group.repos.filter(repo => matchesRepoSearch(repo, query));
    if (repos.length > 0) filtered.push({ ...group, repos });
  }
  return filtered;
}

// Rule: 收藏按仓库组展示；收藏顺序沿用第一个命中的成员，组内成员不重复出现。
export function favoriteWorktreeGroups(groups: WorktreeGroup[], favoriteRepoIds: string[]) {
  const groupByRepoId = new Map<string, WorktreeGroup>();
  for (const group of groups) {
    for (const repo of group.repos) groupByRepoId.set(repo.id, group);
  }

  const seen = new Set<string>();
  const result: WorktreeGroup[] = [];
  for (const repoId of favoriteRepoIds) {
    const group = groupByRepoId.get(repoId);
    if (!group || seen.has(group.id)) continue;
    seen.add(group.id);
    result.push(group);
  }
  return result;
}

export function nonFavoriteWorktreeGroups(groups: WorktreeGroup[], favoriteRepoIds: string[]) {
  const favoriteIds = new Set(favoriteWorktreeGroups(groups, favoriteRepoIds).map(group => group.id));
  return groups.filter(group => !favoriteIds.has(group.id));
}

export function isWorktreeGroupFavorite(group: WorktreeGroup, favoriteRepoIds: string[]) {
  const favoriteIds = new Set(favoriteRepoIds);
  return group.repos.some(repo => favoriteIds.has(repo.id));
}

export function findWorktreeGroup(groups: WorktreeGroup[], repoId: string) {
  return groups.find(group => group.repos.some(repo => repo.id === repoId));
}

export function aggregateWorktreeGroupStatus(repos: Repo[]): RepoStatus {
  let worst: RepoStatus = 'clean';
  for (const repo of repos) {
    if (statusPriority[repo.status] > statusPriority[worst]) worst = repo.status;
  }
  return worst;
}

export function worktreeGroupModified(repos: Repo[]) {
  return repos.reduce((total, repo) => total + repo.modified, 0);
}

export function worktreeGroupConflicts(repos: Repo[]) {
  return repos.reduce((total, repo) => total + repo.conflicts, 0);
}

export function worktreeGroupHasRemoteError(repos: Repo[]) {
  return repos.some(repo => repo.remoteCheck?.status === 'error');
}

function createWorktreeGroup(id: string, members: Repo[]): WorktreeGroup | undefined {
  const first = members[0];
  if (!first) return undefined;
  const mainRepo = members.find(repo => repo.isMainWorktree);
  const repos = [...members].sort(compareWorktreeRepos);
  const fallback = repos[0] ?? first;
  return {
    id,
    name: mainRepo?.name || fallback.worktreeGroupName || fallback.name,
    category: mainRepo?.category || fallback.category,
    repos,
    mainRepo,
    representativeId: mainRepo?.id ?? fallback.id,
    total: members.length,
  };
}

function compareWorktreeRepos(left: Repo, right: Repo) {
  if (Boolean(left.isMainWorktree) !== Boolean(right.isMainWorktree)) {
    return left.isMainWorktree ? -1 : 1;
  }
  return left.name.localeCompare(right.name) || left.path.localeCompare(right.path);
}
