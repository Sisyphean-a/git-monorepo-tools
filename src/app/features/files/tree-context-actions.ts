import type { RepoTreeEntry } from '../../domain/types.js';

export function treeEntryCopyValues(repoPath: string, entry: RepoTreeEntry) {
  const separator = repoPath.includes('\\') ? '\\' : '/';
  const root = repoPath.replace(/[\\/]+$/, '');
  return {
    name: entry.name,
    relativePath: entry.path,
    absolutePath: `${root}${separator}${entry.path.replace(/\//g, separator)}`,
  };
}
