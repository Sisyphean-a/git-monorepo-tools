import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, File, FileText, Folder, FolderOpen, LoaderCircle } from 'lucide-react';
import { useAppBackend } from '../application/backend-context';
import type { AppSettings, RepoDetail, RepoFileContent, RepoTreeEntry } from '../domain/types';
import { C } from '../theme';

interface RepoFilesTabProps {
  repo: RepoDetail;
  settings: AppSettings;
  active: boolean;
}

type DirectoryState =
  | { status: 'loading'; entries: RepoTreeEntry[] }
  | { status: 'loaded'; entries: RepoTreeEntry[] }
  | { status: 'error'; entries: RepoTreeEntry[]; message: string };

type FileState =
  | { status: 'idle' }
  | { status: 'loading'; path: string }
  | { status: 'loaded'; file: RepoFileContent }
  | { status: 'error'; path: string; message: string };

export function RepoFilesTab({ repo, settings, active }: RepoFilesTabProps) {
  const backend = useAppBackend();
  const [directories, setDirectories] = useState<Record<string, DirectoryState>>({});
  const [expandedPaths, setExpandedPaths] = useState<ReadonlySet<string>>(() => new Set(['']));
  const [selectedPath, setSelectedPath] = useState('');
  const [fileState, setFileState] = useState<FileState>({ status: 'idle' });
  const directoryRequestSequence = useRef(0);
  const activeDirectoryRequests = useRef(new Map<string, number>());
  const fileRequestSequence = useRef(0);
  const target = { path: repo.path, category: repo.category };

  const loadDirectory = useCallback(async (path: string) => {
    if (activeDirectoryRequests.current.has(path)) return;
    const sequence = ++directoryRequestSequence.current;
    activeDirectoryRequests.current.set(path, sequence);
    setDirectories(current => ({
      ...current,
      [path]: { status: 'loading', entries: current[path]?.entries ?? [] },
    }));
    try {
      const entries = await backend.listRepoDirectory({ repoId: repo.id, path, settings, target });
      if (activeDirectoryRequests.current.get(path) === sequence) {
        setDirectories(current => ({ ...current, [path]: { status: 'loaded', entries } }));
      }
    } catch (error) {
      if (activeDirectoryRequests.current.get(path) === sequence) {
        setDirectories(current => ({
          ...current,
          [path]: {
            status: 'error',
            entries: current[path]?.entries ?? [],
            message: readErrorMessage(error, '目录加载失败'),
          },
        }));
      }
    } finally {
      if (activeDirectoryRequests.current.get(path) === sequence) {
        activeDirectoryRequests.current.delete(path);
      }
    }
  }, [backend, repo.id, settings, target.category, target.path]);

  useEffect(() => {
    if (active && expandedPaths.has('') && !directories['']) {
      void loadDirectory('');
    }
  }, [active, directories, expandedPaths, loadDirectory]);

  useEffect(() => () => {
    activeDirectoryRequests.current.clear();
    fileRequestSequence.current += 1;
  }, []);

  const toggleDirectory = (path: string) => {
    if (expandedPaths.has(path)) {
      setExpandedPaths(current => {
        const next = new Set(current);
        for (const expandedPath of current) {
          if (isPathWithin(expandedPath, path)) next.delete(expandedPath);
        }
        return next;
      });
      for (const requestedPath of activeDirectoryRequests.current.keys()) {
        if (isPathWithin(requestedPath, path)) activeDirectoryRequests.current.delete(requestedPath);
      }
      // Effect: 折叠目录时释放其子树缓存，内存只随当前展开范围增长。
      setDirectories(current => Object.fromEntries(
        Object.entries(current).filter(([loadedPath]) => !isPathWithin(loadedPath, path)),
      ));
      return;
    }
    setExpandedPaths(current => new Set(current).add(path));
    void loadDirectory(path);
  };

  const selectFile = async (entry: RepoTreeEntry) => {
    const sequence = ++fileRequestSequence.current;
    setSelectedPath(entry.path);
    setFileState({ status: 'loading', path: entry.path });
    try {
      const file = await backend.readRepoFile({ repoId: repo.id, path: entry.path, settings, target });
      if (sequence === fileRequestSequence.current) setFileState({ status: 'loaded', file });
    } catch (error) {
      if (sequence === fileRequestSequence.current) {
        setFileState({ status: 'error', path: entry.path, message: readErrorMessage(error, '文件读取失败') });
      }
    }
  };

  return (
    <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', background: C.appBg }}>
      <div style={{ width: 300, minWidth: 220, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: `1px solid ${C.border}`, background: C.panel1 }}>
        <div style={{ height: 34, padding: '0 12px', display: 'flex', alignItems: 'center', color: C.textWeak, fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', borderBottom: `1px solid ${C.border}` }}>
          资源管理器
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '5px 0 10px' }}>
          <TreeChildren
            parentPath=""
            depth={0}
            directories={directories}
            expandedPaths={expandedPaths}
            selectedPath={selectedPath}
            onToggleDirectory={toggleDirectory}
            onSelectFile={entry => void selectFile(entry)}
            onRetryDirectory={path => void loadDirectory(path)}
          />
        </div>
        <div title={repo.path} style={{ padding: '7px 10px', borderTop: `1px solid ${C.border}`, color: C.textWeak, fontSize: 10, fontFamily: 'JetBrains Mono, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {repo.path}
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', background: C.appBg }}>
        <FilePreview state={fileState} />
      </div>
    </div>
  );
}

function TreeChildren({
  parentPath,
  depth,
  directories,
  expandedPaths,
  selectedPath,
  onToggleDirectory,
  onSelectFile,
  onRetryDirectory,
}: {
  parentPath: string;
  depth: number;
  directories: Record<string, DirectoryState>;
  expandedPaths: ReadonlySet<string>;
  selectedPath: string;
  onToggleDirectory: (path: string) => void;
  onSelectFile: (entry: RepoTreeEntry) => void;
  onRetryDirectory: (path: string) => void;
}) {
  const directory = directories[parentPath];
  if (!directory) return null;
  if (directory.status === 'loading' && directory.entries.length === 0) {
    return <TreeHint depth={depth} icon={<LoaderCircle size={12} />} text="加载中…" />;
  }
  if (directory.status === 'error' && directory.entries.length === 0) {
    return <TreeHint depth={depth} text={directory.message} action="重试" onClick={() => onRetryDirectory(parentPath)} error />;
  }
  if (directory.status === 'loaded' && directory.entries.length === 0) {
    return <TreeHint depth={depth} text="空目录" />;
  }

  return (
    <>
      {directory.entries.map(entry => {
        const expanded = entry.isDir && expandedPaths.has(entry.path);
        return (
          <div key={entry.path}>
            <TreeRow
              name={entry.name}
              path={entry.path}
              depth={depth}
              directory={entry.isDir}
              expanded={expanded}
              selected={!entry.isDir && selectedPath === entry.path}
              onClick={() => entry.isDir ? onToggleDirectory(entry.path) : onSelectFile(entry)}
            />
            {expanded && (
              <TreeChildren
                parentPath={entry.path}
                depth={depth + 1}
                directories={directories}
                expandedPaths={expandedPaths}
                selectedPath={selectedPath}
                onToggleDirectory={onToggleDirectory}
                onSelectFile={onSelectFile}
                onRetryDirectory={onRetryDirectory}
              />
            )}
          </div>
        );
      })}
      {directory.status === 'error' && (
        <TreeHint depth={depth} text={directory.message} action="重试" onClick={() => onRetryDirectory(parentPath)} error />
      )}
    </>
  );
}

function TreeRow({
  name,
  path,
  depth,
  directory,
  expanded,
  selected,
  onClick,
}: {
  name: string;
  path: string;
  depth: number;
  directory: boolean;
  expanded: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="repo-file-tree-row"
      data-selected={selected}
      title={path || name}
      onClick={onClick}
      style={{
        width: '100%',
        height: 25,
        padding: `0 8px 0 ${8 + depth * 16}px`,
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        border: 'none',
        background: selected ? C.selectedBg : 'transparent',
        color: selected ? C.textPrimary : C.textSecondary,
        cursor: 'pointer',
        fontSize: 12,
        textAlign: 'left',
      }}
    >
      <span style={{ width: 14, height: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: C.textWeak, flexShrink: 0 }}>
        {directory ? (expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : null}
      </span>
      <span style={{ display: 'inline-flex', color: directory ? C.needPull : C.textWeak, flexShrink: 0 }}>
        {directory ? (expanded ? <FolderOpen size={15} /> : <Folder size={15} />) : <File size={14} />}
      </span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
    </button>
  );
}

function TreeHint({ depth, text, icon, action, error, onClick }: { depth: number; text: string; icon?: ReactNode; action?: string; error?: boolean; onClick?: () => void }) {
  return (
    <div style={{ minHeight: 25, paddingLeft: 28 + depth * 16, paddingRight: 8, display: 'flex', alignItems: 'center', gap: 6, color: error ? C.conflict : C.textWeak, fontSize: 11 }}>
      {icon}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{text}</span>
      {action && (
        <button type="button" onClick={onClick} style={{ border: 'none', background: 'none', color: C.needPull, padding: 0, cursor: 'pointer', fontSize: 11 }}>
          {action}
        </button>
      )}
    </div>
  );
}

function FilePreview({ state }: { state: FileState }) {
  if (state.status === 'idle') {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10, color: C.textWeak }}>
        <FileText size={30} strokeWidth={1.4} />
        <span style={{ fontSize: 12 }}>从左侧选择文件以查看内容</span>
      </div>
    );
  }

  const path = state.status === 'loaded' ? state.file.path : state.path;
  return (
    <>
      <div style={{ height: 34, padding: '0 12px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: `1px solid ${C.border}`, background: C.panel1, color: C.textSecondary, flexShrink: 0 }}>
        <File size={13} color={C.textWeak} />
        <span title={path} style={{ minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}>{path}</span>
        {state.status === 'loaded' && <span style={{ color: C.textWeak, fontSize: 10, flexShrink: 0 }}>{formatBytes(state.file.size)}</span>}
      </div>
      {state.status === 'loading' && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: C.textWeak, fontSize: 12 }}>
          <LoaderCircle size={14} /> 正在读取文件…
        </div>
      )}
      {state.status === 'error' && (
        <div style={{ margin: 16, padding: '10px 12px', border: `1px solid ${C.conflict}44`, borderRadius: 7, background: `${C.conflict}10`, color: C.conflict, fontSize: 11, lineHeight: 1.6 }}>
          {state.message}
        </div>
      )}
      {state.status === 'loaded' && (
        <pre style={{ flex: 1, minWidth: 0, minHeight: 0, margin: 0, padding: '14px 16px 28px', overflow: 'auto', color: C.textPrimary, fontFamily: 'JetBrains Mono, Consolas, monospace', fontSize: 12, lineHeight: 1.65, tabSize: 2, whiteSpace: 'pre', background: C.appBg }}>
          {state.file.content}
        </pre>
      )}
    </>
  );
}

function isPathWithin(candidate: string, parent: string) {
  return candidate === parent || (parent === '' ? candidate !== '' : candidate.startsWith(`${parent}/`));
}

function readErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message;
  return fallback;
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  return `${(size / 1024).toFixed(1)} KB`;
}
