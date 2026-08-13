import type { FileChange, FileDiff } from '../../domain/types.js';

export type FetchFileDiff = (file: FileChange) => Promise<FileDiff>;

export interface FileDiffLoader {
  getCached(file: FileChange): FileDiff | undefined;
  load(file: FileChange): Promise<FileDiff>;
}

export function fileDiffKey(file: FileChange) {
  return [
    file.staged ? 'staged' : 'unstaged',
    file.untracked ? 'untracked' : 'tracked',
    file.path,
    file.status,
    file.additions,
    file.deletions,
    file.size,
  ].join('\0');
}

export function createFileDiffLoader(fetchDiff: FetchFileDiff): FileDiffLoader {
  const cache = new Map<string, FileDiff>();
  const pendingRequests = new Map<string, Promise<FileDiff>>();

  const load = (file: FileChange) => {
    const key = fileDiffKey(file);
    const cached = cache.get(key);
    if (cached) return Promise.resolve(cached);
    const existing = pendingRequests.get(key);
    if (existing) return existing;

    const pending = fetchDiff(file).then(diff => {
      cache.set(key, diff);
      pendingRequests.delete(key);
      return diff;
    }, error => {
      pendingRequests.delete(key);
      throw error;
    });
    pendingRequests.set(key, pending);
    return pending;
  };

  return {
    getCached: file => cache.get(fileDiffKey(file)),
    load,
  };
}
