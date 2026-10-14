import type { RepoInteractionBackend, RepoRefreshTarget } from '../../application/ports.js';
import type { AppSettings, RepoFileContent, RepoTreeEntry } from '../../domain/types.js';
import { detectPreviewKind, maxPreviewRenderBytes } from './file-preview-kind.js';
import type { FilePreviewRenderer } from './file-renderer.js';

export type DirectoryState =
  | { status: 'loading'; entries: RepoTreeEntry[] }
  | { status: 'loaded'; entries: RepoTreeEntry[] }
  | { status: 'error'; entries: RepoTreeEntry[]; message: string };

export type FileState =
  | { status: 'idle' }
  | { status: 'loading'; path: string }
  | { status: 'loaded'; file: RepoFileContent }
  | { status: 'error'; path: string; message: string };

export interface RenderedFile {
  path: string;
  kind: 'markdown' | 'code';
  html: string;
}

export interface FileBrowserState {
  directories: Record<string, DirectoryState>;
  fileState: FileState;
  renderedFile: RenderedFile | null;
  renderNotice: string | null;
}

interface FileBrowserSessionOptions {
  repoId: string;
  target: RepoRefreshTarget;
  backend: Pick<RepoInteractionBackend, 'listRepoDirectory' | 'readRepoFile' | 'readRepoFileIfChanged'>;
  getSettings: () => AppSettings;
  onChange: (state: FileBrowserState) => void;
  loadRenderer: () => Promise<FilePreviewRenderer>;
}

export function createFileBrowserSession(options: FileBrowserSessionOptions) {
  let state: FileBrowserState = { directories: {}, fileState: { status: 'idle' }, renderedFile: null, renderNotice: null };
  let directorySequence = 0;
  const directoryRequests = new Map<string, number>();
  let fileSequence = 0;
  let currentFile: RepoFileContent | null = null;
  let revision: string | null = null;
  let fileRequest: { path: string; sequence: number } | null = null;
  const publish = (change: Partial<FileBrowserState>) => {
    state = { ...state, ...change };
    options.onChange(state);
  };
  const requestFor = (path: string) => ({ repoId: options.repoId, path, settings: options.getSettings(), target: options.target });

  return {
    readState: () => state,
    async loadDirectory(path: string) {
      if (directoryRequests.has(path)) return;
      const sequence = ++directorySequence;
      directoryRequests.set(path, sequence);
      publish({ directories: { ...state.directories, [path]: { status: 'loading', entries: state.directories[path]?.entries ?? [] } } });
      try {
        const entries = await options.backend.listRepoDirectory(requestFor(path));
        if (directoryRequests.get(path) === sequence) {
          publish({ directories: { ...state.directories, [path]: { status: 'loaded', entries } } });
        }
      } catch (error) {
        if (directoryRequests.get(path) === sequence) {
          publish({ directories: { ...state.directories, [path]: { status: 'error', entries: state.directories[path]?.entries ?? [], message: readErrorMessage(error, '目录加载失败') } } });
        }
      } finally {
        if (directoryRequests.get(path) === sequence) directoryRequests.delete(path);
      }
    },
    async loadFile(path: string, freshSelection = false, checkRevision = false) {
      if (fileRequest?.path === path) return;
      const sequence = ++fileSequence;
      fileRequest = { path, sequence };
      if (freshSelection || !currentFile) {
        if (freshSelection) {
          currentFile = null;
          revision = null;
        }
        publish({ fileState: { status: 'loading', path }, renderedFile: null, renderNotice: null });
      }
      try {
        const request = requestFor(path);
        const file = checkRevision && revision
          ? await options.backend.readRepoFileIfChanged(request, revision)
          : await options.backend.readRepoFile(request);
        if (sequence !== fileSequence || !file) return;
        revision = file.revision;
        if (currentFile?.path === path && currentFile.content === file.content && currentFile.size === file.size) return;
        const kind = detectPreviewKind(file.path);
        let renderedFile: RenderedFile | null = null;
        let renderNotice: string | null = null;
        if (kind !== 'text') {
          if (file.size > maxPreviewRenderBytes) {
            renderNotice = '文件较大，已关闭高亮与预览渲染';
          } else {
            try {
              const renderer = await options.loadRenderer();
              renderedFile = { path: file.path, kind, html: renderer.renderFilePreviewHtml({ path: file.path, content: file.content, kind }) };
            } catch (error) {
              // Failure: 渲染失败保留正文，不冒充文件读取失败。
              renderNotice = `预览渲染失败，已按纯文本显示：${readErrorMessage(error, '未知错误')}`;
            }
          }
        }
        if (sequence !== fileSequence) return;
        currentFile = file;
        publish({ fileState: { status: 'loaded', file }, renderedFile, renderNotice });
      } catch (error) {
        if (sequence === fileSequence) {
          currentFile = null;
          revision = null;
          publish({ fileState: { status: 'error', path, message: readErrorMessage(error, '文件读取失败') }, renderedFile: null, renderNotice: null });
        }
      } finally {
        if (fileRequest?.sequence === sequence) fileRequest = null;
      }
    },
    releaseDirectory(path: string) {
      for (const requestedPath of directoryRequests.keys()) {
        if (isPathWithin(requestedPath, path)) directoryRequests.delete(requestedPath);
      }
      publish({ directories: Object.fromEntries(Object.entries(state.directories).filter(([loadedPath]) => !isPathWithin(loadedPath, path))) });
    },
    release() {
      // Guarantee: 释放同时使在途读取和渲染失效；重新进入仍可通过同一会话按需读取。
      directoryRequests.clear();
      fileSequence += 1;
      fileRequest = null;
      currentFile = null;
      revision = null;
      publish({ directories: {}, fileState: { status: 'idle' }, renderedFile: null, renderNotice: null });
    },
  };
}

export function isPathWithin(candidate: string, parent: string) {
  return candidate === parent || (parent === '' ? candidate !== '' : candidate.startsWith(`${parent}/`));
}

function readErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message;
  return fallback;
}
