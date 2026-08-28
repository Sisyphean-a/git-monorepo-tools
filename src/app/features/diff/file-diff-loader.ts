import type { FileChange, FileDiff } from '../../domain/types.js';

export type FetchFileDiff = (file: FileChange) => Promise<FileDiff>;

export interface FileDiffLoader {
  load(file: FileChange): Promise<FileDiff>;
  dispose?(): void;
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
  const pendingRequests = new Map<string, Promise<FileDiff>>();

  const load = (file: FileChange) => {
    const key = fileDiffKey(file);
    const existing = pendingRequests.get(key);
    if (existing) return existing;

    let pending: Promise<FileDiff>;
    pending = fetchDiff(file).then(diff => {
      if (pendingRequests.get(key) === pending) pendingRequests.delete(key);
      return diff;
    }, error => {
      if (pendingRequests.get(key) === pending) pendingRequests.delete(key);
      throw error;
    });
    pendingRequests.set(key, pending);
    return pending;
  };

  const dispose = () => {
    // Wails 无法取消进行中的进程，但切换/关闭时清空引用可尽早释放这一代请求。
    pendingRequests.clear();
  };

  return { load, dispose };
}
