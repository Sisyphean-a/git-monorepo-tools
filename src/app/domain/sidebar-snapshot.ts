import { replaceRepoInList, toRepoSummary } from './repo-snapshot-merge.js';
import type { AppSnapshot, Repo, RepoSnapshotUpdate } from './types.js';

export interface SidebarSnapshot {
  scannedAt: string;
  categories: string[];
  repos: Repo[];
}

export function buildSidebarSnapshot(snapshot: Pick<AppSnapshot, 'scannedAt' | 'categories' | 'repos'>): SidebarSnapshot {
  return {
    scannedAt: snapshot.scannedAt,
    categories: [...snapshot.categories],
    repos: [...snapshot.repos],
  };
}

export function mergeSidebarRepoUpdate(snapshot: SidebarSnapshot, update: RepoSnapshotUpdate): SidebarSnapshot {
  // Rule: 单仓更新只改仓库摘要，不覆盖全局扫描时间；scannedAt 只由完整快照维护。
  return {
    ...snapshot,
    repos: replaceRepoInList(snapshot.repos, toRepoSummary(update.repo)),
  };
}
