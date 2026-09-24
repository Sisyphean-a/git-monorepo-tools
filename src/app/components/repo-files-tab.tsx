import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type UIEvent } from 'react';
import { Archive, ArrowDown, ArrowUp, Bot, ChevronDown, ChevronRight, File, FileImage, FileText, Folder, FolderOpen, GitBranch, LoaderCircle, Search, X } from 'lucide-react';
import { useAppBackend } from '../application/backend-context';
import type { AppSettings, RepoDetail, RepoFileContent, RepoTreeEntry } from '../domain/types';
import { detectPreviewKind, maxPreviewRenderBytes } from '../features/files/file-preview-kind';
import { fileIconKind, folderIconColor } from '../features/files/file-icon-kind';
import { findFileMatches, type FileSearchMatch, type FileSearchOptions } from '../features/files/file-search';
import { clampTreeWidth, treeResizerWidth, treeWidthDefault, treeWidthMax, treeWidthMin, treeWidthStep } from '../features/files/tree-width';
import { resolveMarkdownLink } from '../features/files/markdown-links';
import { C } from '../theme';
import type { FilePreviewRenderer } from '../features/files/file-renderer';

export interface RepoFilePosition {
  selectedPath: string;
  expandedPaths: string[];
  treeScrollTop: number;
  previewScrollTop: number;
  markdownView: 'preview' | 'raw';
  wrapLines: boolean;
}

interface RepoFilesTabProps {
  repo: RepoDetail;
  settings: AppSettings;
  active: boolean;
  position?: RepoFilePosition;
  onPositionChange: (position: RepoFilePosition) => void;
  onFileTreeWidthChange: (width: number) => void;
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

type MarkdownView = 'preview' | 'raw';

interface RenderedFile {
  path: string;
  kind: 'markdown' | 'code';
  html: string;
}

// Effect: 高亮与 Markdown 渲染器只在首次需要时加载，不打开代码/Markdown 文件的会话不付这份体积。
let rendererPromise: Promise<FilePreviewRenderer> | null = null;
function loadFilePreviewRenderer() {
  rendererPromise ??= import('../features/files/file-renderer');
  return rendererPromise;
}

export function RepoFilesTab({ repo, settings, active, position, onPositionChange, onFileTreeWidthChange }: RepoFilesTabProps) {
  const backend = useAppBackend();
  const positionRef = useRef<RepoFilePosition>(position ?? { selectedPath: '', expandedPaths: [''], treeScrollTop: 0, previewScrollTop: 0, markdownView: 'preview', wrapLines: true });
  const [directories, setDirectories] = useState<Record<string, DirectoryState>>({});
  const [expandedPaths, setExpandedPaths] = useState<ReadonlySet<string>>(() => new Set(positionRef.current.expandedPaths));
  const [selectedPath, setSelectedPath] = useState(positionRef.current.selectedPath);
  const [fileState, setFileState] = useState<FileState>({ status: 'idle' });
  const [renderedFile, setRenderedFile] = useState<RenderedFile | null>(null);
  const [renderNotice, setRenderNotice] = useState<string | null>(null);
  const [markdownView, setMarkdownView] = useState<MarkdownView>(positionRef.current.markdownView);
  const [wrapLines, setWrapLines] = useState(positionRef.current.wrapLines);
  const [anchorTarget, setAnchorTarget] = useState<{ path: string; fragment: string; id: number } | null>(null);
  const anchorSequence = useRef(0);
  const treeRef = useRef<HTMLDivElement | null>(null);
  const restoringTree = useRef(positionRef.current.treeScrollTop > 0);
  const expandedPathsRef = useRef(expandedPaths);
  const selectedPathRef = useRef(selectedPath);
  // Rule: 后端读取始终取最新设置，但设置对象换新不得重建读取回调，否则每次保存设置都会重读已展开目录与当前文件。
  const settingsRef = useRef(settings);
  expandedPathsRef.current = expandedPaths;
  selectedPathRef.current = selectedPath;
  settingsRef.current = settings;
  const directoryRequestSequence = useRef(0);
  const activeDirectoryRequests = useRef(new Map<string, number>());
  const fileRequestSequence = useRef(0);
  const currentFile = useRef<RepoFileContent | null>(null);
  const revisionRef = useRef<string | null>(null);
  const activeFileRequest = useRef<{ path: string; sequence: number } | null>(null);
  const target = { path: repo.path, category: repo.category };
  const rememberPosition = (next: Partial<RepoFilePosition>) => {
    positionRef.current = { ...positionRef.current, ...next };
    onPositionChange(positionRef.current);
  };

  const filesLayoutRef = useRef<HTMLDivElement | null>(null);
  const sidebarRef = useRef<HTMLDivElement | null>(null);
  const [treeWidth, setTreeWidth] = useState(settings.fileTreeWidths[repo.id] ?? treeWidthDefault);
  const [layoutWidth, setLayoutWidth] = useState(0);
  const [resizingTree, setResizingTree] = useState(false);
  const treeResize = useRef<{ pointerId: number; startX: number; startWidth: number; lastWidth: number } | null>(null);
  const effectiveTreeWidth = clampTreeWidth(treeWidth, layoutWidth);
  const treeWidthUpperBound = treeWidthMax(layoutWidth);

  useLayoutEffect(() => {
    const element = filesLayoutRef.current;
    if (!element) return;
    setLayoutWidth(element.clientWidth);
    const observer = new ResizeObserver(() => setLayoutWidth(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!resizingTree) return;
    // Flow: 拖动期间指针会离开分割条，游标与文本选择由 body 类统一压制。
    document.body.classList.add('repo-files-resizing');
    return () => document.body.classList.remove('repo-files-resizing');
  }, [resizingTree]);

  const handleTreeResizeStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    treeResize.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: effectiveTreeWidth, lastWidth: effectiveTreeWidth };
    event.currentTarget.setPointerCapture(event.pointerId);
    setResizingTree(true);
  };

  const handleTreeResizeMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = treeResize.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    // Rule: 拖动中直接写侧栏 DOM 宽度，不让大文件树在每次指针移动时整体重渲染；React 只在 style 值变化时覆盖 DOM，其他重渲染不会把宽度打回。
    const width = clampTreeWidth(drag.startWidth + event.clientX - drag.startX, layoutWidth);
    drag.lastWidth = width;
    if (sidebarRef.current) sidebarRef.current.style.width = `${width}px`;
  };

  const handleTreeResizeEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = treeResize.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    treeResize.current = null;
    setResizingTree(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setTreeWidth(drag.lastWidth);
    onFileTreeWidthChange(drag.lastWidth);
  };

  const handleTreeResizeKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = event.key === 'ArrowLeft' ? -treeWidthStep : event.key === 'ArrowRight' ? treeWidthStep : 0;
    if (!step) return;
    event.preventDefault();
    const next = clampTreeWidth(effectiveTreeWidth + step, layoutWidth);
    if (next === effectiveTreeWidth) return;
    setTreeWidth(next);
    onFileTreeWidthChange(next);
  };

  const loadDirectory = useCallback(async (path: string) => {
    if (activeDirectoryRequests.current.has(path)) return;
    const sequence = ++directoryRequestSequence.current;
    activeDirectoryRequests.current.set(path, sequence);
    setDirectories(current => ({
      ...current,
      [path]: { status: 'loading', entries: current[path]?.entries ?? [] },
    }));
    try {
      const entries = await backend.listRepoDirectory({ repoId: repo.id, path, settings: settingsRef.current, target });
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
  }, [backend, repo.id, target.category, target.path]);

  const loadFile = useCallback(async (path: string, freshSelection = false, checkRevision = false) => {
    if (activeFileRequest.current?.path === path) return;
    const sequence = ++fileRequestSequence.current;
    activeFileRequest.current = { path, sequence };
    if (freshSelection || (!currentFile.current && !checkRevision)) {
      if (freshSelection) {
        currentFile.current = null;
        revisionRef.current = null;
      }
      setFileState({ status: 'loading', path });
      setRenderedFile(null);
      setRenderNotice(null);
    }
    try {
      const request = { repoId: repo.id, path, settings: settingsRef.current, target };
      const file = checkRevision && revisionRef.current
        ? await backend.readRepoFileIfChanged(request, revisionRef.current)
        : await backend.readRepoFile(request);
      if (sequence !== fileRequestSequence.current || !file) return;
      revisionRef.current = file.revision;
      if (currentFile.current?.path === path && currentFile.current.content === file.content && currentFile.current.size === file.size) return;
      const kind = detectPreviewKind(file.path);
      let nextRendered: RenderedFile | null = null;
      let nextNotice: string | null = null;
      if (kind !== 'text') {
        if (file.size > maxPreviewRenderBytes) {
          nextNotice = '文件较大，已关闭高亮与预览渲染';
        } else {
          try {
            const renderer = await loadFilePreviewRenderer();
            nextRendered = { path: file.path, kind, html: renderer.renderFilePreviewHtml({ path: file.path, content: file.content, kind }) };
          } catch (error) {
            // Failure: 渲染失败不丢正文；重新进入仍可重读文件。
            nextNotice = `预览渲染失败，已按纯文本显示：${readErrorMessage(error, '未知错误')}`;
          }
        }
      }
      if (sequence !== fileRequestSequence.current) return;
      currentFile.current = file;
      setRenderedFile(nextRendered);
      setRenderNotice(nextNotice);
      setFileState({ status: 'loaded', file });
    } catch (error) {
      if (sequence === fileRequestSequence.current) {
        currentFile.current = null;
        revisionRef.current = null;
        setRenderedFile(null);
        setRenderNotice(null);
        setFileState({ status: 'error', path, message: readErrorMessage(error, '文件读取失败') });
      }
    } finally {
      if (activeFileRequest.current?.sequence === sequence) activeFileRequest.current = null;
    }
  }, [backend, repo.id, target.category, target.path]);

  // Flow: 重新进入或重获焦点时更新已展开目录，并按版本检查当前文件；正文只在版本变化时重读。
  const refreshView = useCallback(() => {
    for (const path of expandedPathsRef.current) void loadDirectory(path);
    if (selectedPathRef.current) void loadFile(selectedPathRef.current, false, true);
  }, [loadDirectory, loadFile]);

  useEffect(() => {
    if (!active) return;
    refreshView();
    window.addEventListener('focus', refreshView);
    return () => window.removeEventListener('focus', refreshView);
  }, [active, refreshView]);

  useEffect(() => {
    if (!active || !selectedPath) return;
    // Rule: 只检查当前文件元数据；未变化时不传输正文、不重新渲染，后台或失焦时停止检查。
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible' && document.hasFocus()) void loadFile(selectedPath, false, true);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [active, selectedPath, loadFile]);

  useLayoutEffect(() => {
    if (!restoringTree.current || !treeRef.current) return;
    treeRef.current.scrollTop = positionRef.current.treeScrollTop;
    if ([...expandedPaths].every(path => directories[path] && directories[path].status !== 'loading')) restoringTree.current = false;
  }, [directories, expandedPaths]);

  useEffect(() => () => {
    activeDirectoryRequests.current.clear();
    fileRequestSequence.current += 1;
  }, []);

  const toggleDirectory = (path: string) => {
    if (expandedPaths.has(path)) {
      const next = new Set(expandedPaths);
      for (const expandedPath of expandedPaths) {
        if (isPathWithin(expandedPath, path)) next.delete(expandedPath);
      }
      setExpandedPaths(next);
      rememberPosition({ expandedPaths: [...next] });
      for (const requestedPath of activeDirectoryRequests.current.keys()) {
        if (isPathWithin(requestedPath, path)) activeDirectoryRequests.current.delete(requestedPath);
      }
      // Effect: 折叠目录时释放其子树缓存，内存只随当前展开范围增长。
      setDirectories(current => Object.fromEntries(
        Object.entries(current).filter(([loadedPath]) => !isPathWithin(loadedPath, path)),
      ));
      return;
    }
    const next = new Set(expandedPaths).add(path);
    setExpandedPaths(next);
    rememberPosition({ expandedPaths: [...next] });
    void loadDirectory(path);
  };

  const selectFile = (path: string) => {
    setSelectedPath(path);
    setAnchorTarget(null);
    setMarkdownView('preview');
    rememberPosition({ selectedPath: path, previewScrollTop: 0, markdownView: 'preview' });
    void loadFile(path, true);
  };

  // Flow: 打开 Markdown 内部链接时先展开目标的祖先目录，使文件树定位到同一文件。
  const openLinkedFile = (path: string, fragment?: string) => {
    if (fragment) setAnchorTarget({ path, fragment, id: ++anchorSequence.current });
    if (path === selectedPath && fileState.status === 'loaded') return;
    const ancestors = path.split('/').slice(0, -1).reduce<string[]>(
      (accumulator, segment) => [...accumulator, accumulator.length ? `${accumulator[accumulator.length - 1]}/${segment}` : segment],
      [],
    );
    if (ancestors.length > 0) {
      const next = new Set([...expandedPaths, ...ancestors]);
      setExpandedPaths(next);
      rememberPosition({ expandedPaths: [...next] });
      for (const ancestor of ancestors) void loadDirectory(ancestor);
    }
    setSelectedPath(path);
    setMarkdownView('preview');
    rememberPosition({ selectedPath: path, previewScrollTop: 0, markdownView: 'preview' });
    void loadFile(path, true);
  };

  const handlePreviewClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    const anchor = (event.target as HTMLElement).closest('a');
    const href = anchor?.getAttribute('data-md-href');
    if (!href || !renderedFile) return;
    // Rule: 仓库内容不得让 WebView 自行导航；外链与安全的仓库内锚点在应用内分流。
    event.preventDefault();
    const link = resolveMarkdownLink(renderedFile.path, href);
    if (link.kind === 'external') void backend.openExternalURL(link.url);
    else if (link.kind === 'repo-file') openLinkedFile(link.path, link.fragment);
  };

  return (
    <div ref={filesLayoutRef} style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', background: C.appBg }}>
      <div ref={sidebarRef} style={{ width: effectiveTreeWidth, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: `1px solid ${C.border}`, background: C.panel1 }}>
        <div style={{ height: 34, padding: '0 12px', display: 'flex', alignItems: 'center', color: C.textWeak, fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', borderBottom: `1px solid ${C.border}` }}>
          资源管理器
        </div>
        <div ref={treeRef} onScroll={event => { if (!restoringTree.current) rememberPosition({ treeScrollTop: event.currentTarget.scrollTop }); }} style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '5px 0 10px' }}>
          <TreeChildren
            parentPath=""
            depth={0}
            directories={directories}
            expandedPaths={expandedPaths}
            selectedPath={selectedPath}
            onToggleDirectory={toggleDirectory}
            onSelectFile={entry => void selectFile(entry.path)}
            onRetryDirectory={path => void loadDirectory(path)}
          />
        </div>
        <div title={repo.path} style={{ padding: '7px 10px', borderTop: `1px solid ${C.border}`, color: C.textWeak, fontSize: 10, fontFamily: 'JetBrains Mono, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {repo.path}
        </div>
      </div>

      <div
        role="separator"
        tabIndex={0}
        aria-orientation="vertical"
        aria-label="调整文件树宽度"
        aria-valuemin={treeWidthMin}
        aria-valuemax={Number.isFinite(treeWidthUpperBound) ? Math.round(treeWidthUpperBound) : undefined}
        aria-valuenow={Math.round(effectiveTreeWidth)}
        data-dragging={resizingTree ? 'true' : 'false'}
        className="repo-files-resizer"
        onPointerDown={handleTreeResizeStart}
        onPointerMove={handleTreeResizeMove}
        onPointerUp={handleTreeResizeEnd}
        onPointerCancel={handleTreeResizeEnd}
        onKeyDown={handleTreeResizeKeyDown}
        style={{ width: treeResizerWidth, flexShrink: 0, cursor: 'col-resize', touchAction: 'none' }}
      />

      <div style={{ position: 'relative', flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', background: C.appBg }}>
        <FilePreview
          active={active}
          state={fileState}
          renderedFile={renderedFile}
          notice={renderNotice}
          markdownView={markdownView}
          onMarkdownViewChange={view => { setMarkdownView(view); rememberPosition({ markdownView: view }); }}
          wrapLines={wrapLines}
          onWrapLinesChange={value => { setWrapLines(value); rememberPosition({ wrapLines: value }); }}
          getScrollTop={() => positionRef.current.previewScrollTop}
          onScrollTopChange={value => rememberPosition({ previewScrollTop: value })}
          anchorTarget={anchorTarget}
          onAnchorHandled={() => setAnchorTarget(null)}
          onPreviewClick={handlePreviewClick}
        />
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
  const icon = directory ? null : fileIconKind(name);
  const iconColor = directory ? folderIconColor(name) : icon!.color;
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
      <span style={{ width: 17, height: 17, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: iconColor, flexShrink: 0 }}>
        {directory ? (expanded ? <FolderOpen size={16} fill={iconColor} fillOpacity={0.3} /> : <Folder size={16} fill={iconColor} fillOpacity={0.3} />)
          : icon?.kind === 'badge' ? <span style={{ width: 16, height: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 2, background: icon.background, color: icon.color, fontSize: icon.label.length > 2 ? 8 : 9, fontWeight: 800, lineHeight: 1 }}>{icon.label}</span>
            : icon?.kind === 'git' ? <GitBranch size={16} />
              : icon?.kind === 'markdown' ? <FileText size={16} />
                : icon?.kind === 'robot' ? <Bot size={16} />
                  : icon?.kind === 'image' ? <FileImage size={16} />
                  : icon?.kind === 'archive' ? <Archive size={16} /> : <File size={15} />}
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

function FilePreview({
  active,
  state,
  renderedFile,
  notice,
  markdownView,
  onMarkdownViewChange,
  wrapLines,
  onWrapLinesChange,
  getScrollTop,
  onScrollTopChange,
  anchorTarget,
  onAnchorHandled,
  onPreviewClick,
}: {
  active: boolean;
  state: FileState;
  renderedFile: RenderedFile | null;
  notice: string | null;
  markdownView: MarkdownView;
  onMarkdownViewChange: (view: MarkdownView) => void;
  wrapLines: boolean;
  onWrapLinesChange: (value: boolean) => void;
  getScrollTop: () => number;
  onScrollTopChange: (value: number) => void;
  anchorTarget: { path: string; fragment: string; id: number } | null;
  onAnchorHandled: () => void;
  onPreviewClick: (event: ReactMouseEvent<HTMLDivElement>) => void;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOptions, setSearchOptions] = useState<FileSearchOptions>({ caseSensitive: false, wholeWord: false, useRegex: false });
  const [activeMatchIndex, setActiveMatchIndex] = useState(-1);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const activeMatchRef = useRef<HTMLElement | null>(null);
  const bodyRef = useRef<HTMLElement | null>(null);
  const restoringPreview = useRef(getScrollTop() > 0);
  const [anchorNotice, setAnchorNotice] = useState('');
  const file = state.status === 'loaded' ? state.file : null;
  const searchResult = useMemo(
    () => findFileMatches(file?.content ?? '', searchQuery, searchOptions),
    [file?.content, searchOptions, searchQuery],
  );
  const normalizedMatchIndex = searchResult.matches.length === 0
    ? -1
    : Math.min(Math.max(activeMatchIndex, 0), searchResult.matches.length - 1);

  const openSearch = () => {
    if (!file) return;
    setSearchOpen(true);
    window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
  };

  const closeSearch = () => setSearchOpen(false);
  const navigateMatch = (offset: number) => {
    if (searchResult.matches.length === 0) return;
    setActiveMatchIndex(current => {
      const index = current < 0 ? 0 : current;
      return (index + offset + searchResult.matches.length) % searchResult.matches.length;
    });
  };

  useEffect(() => {
    setActiveMatchIndex(searchResult.matches.length > 0 ? 0 : -1);
  }, [file?.path, searchOptions, searchQuery, searchResult.matches.length]);

  useEffect(() => {
    if (!searchOpen || normalizedMatchIndex < 0) return;
    activeMatchRef.current?.scrollIntoView({ block: 'center', inline: 'nearest' });
  }, [normalizedMatchIndex, searchOpen, searchResult.matches]);

  useEffect(() => {
    if (!active) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        openSearch();
      } else if (event.key === 'Escape' && searchOpen) {
        event.preventDefault();
        closeSearch();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [active, file, searchOpen]);

  const path = state.status === 'loaded' ? state.file.path : state.status === 'idle' ? '' : state.path;
  const kind = file ? detectPreviewKind(file.path) : 'text';
  const activeHtml = file && renderedFile && renderedFile.path === file.path ? renderedFile.html : null;
  const showSearchText = Boolean(file && searchOpen && searchQuery && !searchResult.error);
  const showMarkdownPreview = !showSearchText && kind === 'markdown' && activeHtml !== null && markdownView === 'preview';
  const showHighlightedCode = !showSearchText && kind === 'code' && activeHtml !== null;

  useLayoutEffect(() => {
    if (!bodyRef.current) return;
    bodyRef.current.scrollTop = getScrollTop();
    if (file && (kind === 'text' || activeHtml !== null || notice)) restoringPreview.current = false;
  }, [file?.path, state.status, activeHtml, markdownView, showSearchText, wrapLines, notice]);

  useLayoutEffect(() => { setAnchorNotice(''); }, [file?.path]);

  useLayoutEffect(() => {
    if (!anchorTarget || file?.path !== anchorTarget.path || !showMarkdownPreview || !bodyRef.current) return;
    const body = bodyRef.current;
    const heading = Array.from(body.querySelectorAll('[id]')).find(element => element.id === anchorTarget.fragment);
    if (heading) {
      body.scrollTop += heading.getBoundingClientRect().top - body.getBoundingClientRect().top - 12;
      onScrollTopChange(body.scrollTop);
      setAnchorNotice('');
    } else {
      setAnchorNotice(`未找到章节：${anchorTarget.fragment}`);
    }
    onAnchorHandled();
  }, [anchorTarget, file?.path, showMarkdownPreview, activeHtml]);

  if (state.status === 'idle') {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10, color: C.textWeak }}>
        <FileText size={30} strokeWidth={1.4} />
        <span style={{ fontSize: 12 }}>从左侧选择文件以查看内容</span>
      </div>
    );
  }

  const handleBodyScroll = (event: UIEvent<HTMLElement>) => {
    if (!restoringPreview.current) onScrollTopChange(event.currentTarget.scrollTop);
  };
  const setBodyRef = (element: HTMLElement | null) => { bodyRef.current = element; };
  const textStyle = { ...previewBodyStyle, whiteSpace: wrapLines ? 'pre-wrap' : 'pre', overflowWrap: wrapLines ? 'anywhere' : 'normal' } as const;

  return (
    <>
      <div style={{ height: 34, padding: '0 12px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: `1px solid ${C.border}`, background: C.panel1, color: C.textSecondary, flexShrink: 0 }}>
        <File size={13} color={C.textWeak} />
        <span title={path} style={{ minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}>{path}</span>
        {(notice || anchorNotice) && <span title={notice || anchorNotice} style={{ color: C.textWeak, fontSize: 10, flexShrink: 0, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{notice || anchorNotice}</span>}
        {file && <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
          {kind === 'markdown' && activeHtml !== null && <>
            <ViewModeButton active={markdownView === 'preview'} label="预览" onClick={() => onMarkdownViewChange('preview')} />
            <ViewModeButton active={markdownView === 'raw'} label="原文" onClick={() => onMarkdownViewChange('raw')} />
          </>}
          <ViewModeButton active={wrapLines} label="自动换行" onClick={() => onWrapLinesChange(!wrapLines)} />
        </div>}
        {file && <span style={{ color: C.textWeak, fontSize: 10, flexShrink: 0 }}>{formatBytes(file.size)}</span>}
        <FindIconButton label="在当前文件中查找 (Ctrl+F)" disabled={!file} onClick={openSearch}>
          <Search size={13} />
        </FindIconButton>
      </div>
      {file && searchOpen && (
        <div
          role="search"
          aria-label="在当前文件中查找"
          style={{
            position: 'absolute',
            zIndex: 4,
            top: 41,
            right: 12,
            width: 'min(500px, calc(100% - 24px))',
            minHeight: 40,
            padding: '6px 7px',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            border: `1px solid ${C.borderLight}`,
            borderRadius: 8,
            background: C.panel2,
            boxShadow: '0 10px 28px rgba(0, 0, 0, 0.35)',
          }}
        >
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={event => setSearchQuery(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                event.preventDefault();
                navigateMatch(event.shiftKey ? -1 : 1);
              } else if (event.key === 'Escape') {
                event.preventDefault();
                closeSearch();
              }
            }}
            aria-invalid={Boolean(searchResult.error)}
            aria-label="查找"
            placeholder="查找"
            spellCheck={false}
            style={{
              minWidth: 100,
              flex: 1,
              height: 27,
              padding: '0 8px',
              border: `1px solid ${searchResult.error ? C.conflict : C.border}`,
              borderRadius: 5,
              outline: 'none',
              background: C.panel1,
              color: C.textPrimary,
              fontFamily: 'JetBrains Mono, Consolas, monospace',
              fontSize: 11,
            }}
          />
          <FindOptionButton label="Aa" title="区分大小写" active={searchOptions.caseSensitive} onClick={() => setSearchOptions(current => ({ ...current, caseSensitive: !current.caseSensitive }))} />
          <FindOptionButton label="ab" title="全字匹配" active={searchOptions.wholeWord} underlined onClick={() => setSearchOptions(current => ({ ...current, wholeWord: !current.wholeWord }))} />
          <FindOptionButton label=".*" title="使用正则表达式" active={searchOptions.useRegex} onClick={() => setSearchOptions(current => ({ ...current, useRegex: !current.useRegex }))} />
          <span
            title={searchResult.error ?? (searchResult.matches.length > maxSimultaneousHighlights ? '匹配较多，仅高亮当前结果' : undefined)}
            style={{ width: 58, flexShrink: 0, color: searchResult.error ? C.conflict : C.textWeak, fontSize: 10, textAlign: 'center', whiteSpace: 'nowrap' }}
          >
            {searchResult.error ? '表达式无效' : searchQuery ? (searchResult.matches.length > 0 ? `${normalizedMatchIndex + 1}/${searchResult.matches.length}` : '无结果') : ''}
          </span>
          <FindIconButton label="上一个匹配项 (Shift+Enter)" disabled={searchResult.matches.length === 0} onClick={() => navigateMatch(-1)}>
            <ArrowUp size={14} />
          </FindIconButton>
          <FindIconButton label="下一个匹配项 (Enter)" disabled={searchResult.matches.length === 0} onClick={() => navigateMatch(1)}>
            <ArrowDown size={14} />
          </FindIconButton>
          <FindIconButton label="关闭 (Esc)" onClick={closeSearch}>
            <X size={14} />
          </FindIconButton>
        </div>
      )}
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
      {file && showSearchText && (
        <SearchableFileText
          content={file.content}
          matches={searchResult.matches}
          activeIndex={normalizedMatchIndex}
          wrapLines={wrapLines}
          onScroll={handleBodyScroll}
          onBodyRef={setBodyRef}
          onActiveMatch={element => { activeMatchRef.current = element; }}
        />
      )}
      {file && showMarkdownPreview && (
        <div ref={setBodyRef} onScroll={handleBodyScroll} className="repo-file-preview-scroll" style={previewBodyStyle}>
          <div className="file-preview-markdown" data-wrap={wrapLines} onClick={onPreviewClick} dangerouslySetInnerHTML={{ __html: activeHtml ?? '' }} />
        </div>
      )}
      {file && !showMarkdownPreview && showHighlightedCode && (
        <pre ref={setBodyRef} onScroll={handleBodyScroll} className="repo-file-preview-scroll" style={textStyle}>
          <code className="hljs" style={{ ...codeTextStyle, whiteSpace: wrapLines ? 'pre-wrap' : 'pre', overflowWrap: wrapLines ? 'anywhere' : 'normal' }} dangerouslySetInnerHTML={{ __html: activeHtml ?? '' }} />
        </pre>
      )}
      {file && !showSearchText && !showMarkdownPreview && !showHighlightedCode && (
        <pre ref={setBodyRef} onScroll={handleBodyScroll} className="repo-file-preview-scroll" style={textStyle}>
          {file.content}
        </pre>
      )}
    </>
  );
}

const maxSimultaneousHighlights = 5000;

function SearchableFileText({
  content,
  matches,
  activeIndex,
  wrapLines,
  onScroll,
  onBodyRef,
  onActiveMatch,
}: {
  content: string;
  matches: FileSearchMatch[];
  activeIndex: number;
  wrapLines: boolean;
  onScroll: (event: UIEvent<HTMLElement>) => void;
  onBodyRef: (element: HTMLElement | null) => void;
  onActiveMatch: (element: HTMLElement | null) => void;
}) {
  const activeMatch = matches[activeIndex];
  const visibleMatches = matches.length > maxSimultaneousHighlights && activeMatch ? [activeMatch] : matches;
  const nodes: ReactNode[] = [];
  let cursor = 0;

  visibleMatches.forEach((match, index) => {
    if (match.start > cursor) nodes.push(content.slice(cursor, match.start));
    const current = match === activeMatch;
    const zeroWidth = match.start === match.end;
    nodes.push(
      <mark
        key={`${match.start}:${match.end}:${index}`}
        ref={current ? onActiveMatch : undefined}
        style={{
          display: zeroWidth ? 'inline-block' : undefined,
          width: zeroWidth ? 2 : undefined,
          minHeight: zeroWidth ? '1em' : undefined,
          padding: 0,
          borderRadius: 2,
          outline: current ? `1px solid ${C.modified}` : 'none',
          background: current ? C.modified : `${C.btnPrimary}66`,
          color: current ? C.appBg : C.textPrimary,
        }}
      >
        {zeroWidth ? '\u200b' : content.slice(match.start, match.end)}
      </mark>,
    );
    cursor = match.end;
  });
  if (cursor < content.length) nodes.push(content.slice(cursor));

  return <pre ref={onBodyRef} onScroll={onScroll} className="repo-file-preview-scroll" style={{ ...previewBodyStyle, ...codeTextStyle, whiteSpace: wrapLines ? 'pre-wrap' : 'pre', overflowWrap: wrapLines ? 'anywhere' : 'normal' }}>{nodes}</pre>;
}

function FindOptionButton({
  label,
  title,
  active,
  underlined = false,
  onClick,
}: {
  label: string;
  title: string;
  active: boolean;
  underlined?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      onClick={onClick}
      style={{
        width: 27,
        height: 27,
        flexShrink: 0,
        padding: 0,
        border: `1px solid ${active ? `${C.btnPrimary}88` : 'transparent'}`,
        borderRadius: 5,
        background: active ? C.selectedBg : 'transparent',
        color: active ? C.textPrimary : C.textSecondary,
        cursor: 'pointer',
        fontFamily: 'JetBrains Mono, Consolas, monospace',
        fontSize: 11,
        textDecoration: underlined ? 'underline' : 'none',
        textUnderlineOffset: 2,
      }}
    >
      {label}
    </button>
  );
}

function FindIconButton({
  label,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: 25,
        height: 25,
        flexShrink: 0,
        padding: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: '1px solid transparent',
        borderRadius: 5,
        background: 'transparent',
        color: disabled ? C.textWeak : C.textSecondary,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {children}
    </button>
  );
}

function ViewModeButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        border: `1px solid ${active ? C.borderLight : 'transparent'}`,
        borderRadius: 6,
        background: active ? C.panel3 : 'transparent',
        color: active ? C.textPrimary : C.textWeak,
        cursor: 'pointer',
        fontFamily: 'inherit',
        fontSize: 10,
        padding: '2px 8px',
      }}
    >
      {label}
    </button>
  );
}

const previewBodyStyle = {
  flex: 1,
  minWidth: 0,
  minHeight: 0,
  margin: 0,
  padding: '14px 16px 28px',
  overflow: 'auto',
  background: C.appBg,
  color: C.textPrimary,
} as const;

const codeTextStyle = {
  fontFamily: 'JetBrains Mono, Consolas, monospace',
  fontSize: 12,
  lineHeight: 1.65,
  tabSize: 2,
  whiteSpace: 'pre',
} as const;

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
