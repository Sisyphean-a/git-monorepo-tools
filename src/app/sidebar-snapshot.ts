import { replaceRepoInList } from './repo-snapshot-merge.js';
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
  return {
    ...snapshot,
    scannedAt: update.scannedAt,
    repos: replaceRepoInList(snapshot.repos, update.repo),
  };
}
