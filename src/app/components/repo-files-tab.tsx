import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, File, FileText, Folder, FolderOpen, LoaderCircle, Search, X } from 'lucide-react';
import { useAppBackend } from '../application/backend-context';
import type { AppSettings, RepoDetail, RepoFileContent, RepoTreeEntry } from '../domain/types';
import { detectPreviewKind, maxPreviewRenderBytes } from '../features/files/file-preview-kind';
import { findFileMatches, type FileSearchMatch, type FileSearchOptions } from '../features/files/file-search';
import { resolveMarkdownLink } from '../features/files/markdown-links';
import { C } from '../theme';
import type { FilePreviewRenderer } from '../features/files/file-renderer';

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

export function RepoFilesTab({ repo, settings, active }: RepoFilesTabProps) {
  const backend = useAppBackend();
  const [directories, setDirectories] = useState<Record<string, DirectoryState>>({});
  const [expandedPaths, setExpandedPaths] = useState<ReadonlySet<string>>(() => new Set(['']));
  const [selectedPath, setSelectedPath] = useState('');
  const [fileState, setFileState] = useState<FileState>({ status: 'idle' });
  const [renderedFile, setRenderedFile] = useState<RenderedFile | null>(null);
  const [renderNotice, setRenderNotice] = useState<string | null>(null);
  const [markdownView, setMarkdownView] = useState<MarkdownView>('preview');
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

  const selectFile = async (path: string) => {
    const sequence = ++fileRequestSequence.current;
    setSelectedPath(path);
    setFileState({ status: 'loading', path });
    setRenderedFile(null);
    setRenderNotice(null);
    setMarkdownView('preview');
    try {
      const file = await backend.readRepoFile({ repoId: repo.id, path, settings, target });
      if (sequence !== fileRequestSequence.current) return;
      setFileState({ status: 'loaded', file });
      const kind = detectPreviewKind(file.path);
      if (kind === 'text') return;
      if (file.size > maxPreviewRenderBytes) {
        setRenderNotice('文件较大，已关闭高亮与预览渲染');
        return;
      }
      try {
        const renderer = await loadFilePreviewRenderer();
        if (sequence !== fileRequestSequence.current) return;
        setRenderedFile({ path: file.path, kind, html: renderer.renderFilePreviewHtml({ path: file.path, content: file.content, kind }) });
      } catch (error) {
        // Failure 降级：高亮或渲染失败只影响展示形式，已读到的正文仍以纯文本保留。
        if (sequence === fileRequestSequence.current) setRenderNotice(`预览渲染失败，已按纯文本显示：${readErrorMessage(error, '未知错误')}`);
      }
    } catch (error) {
      if (sequence === fileRequestSequence.current) {
        setFileState({ status: 'error', path, message: readErrorMessage(error, '文件读取失败') });
      }
    }
  };

  // Flow: 打开 Markdown 内部链接时先展开目标的祖先目录，使文件树定位到同一文件。
  const openLinkedFile = async (path: string) => {
    const ancestors = path.split('/').slice(0, -1).reduce<string[]>(
      (accumulator, segment) => [...accumulator, accumulator.length ? `${accumulator[accumulator.length - 1]}/${segment}` : segment],
      [],
    );
    if (ancestors.length > 0) {
      setExpandedPaths(current => new Set([...current, ...ancestors]));
      for (const ancestor of ancestors) void loadDirectory(ancestor);
    }
    await selectFile(path);
  };

  const handlePreviewClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    // Rule: 预览区内的链接一律不走 WebView 默认导航，只由这里分流到外部浏览器或应用内文件。
    event.preventDefault();
    const anchor = (event.target as HTMLElement).closest('a');
    const href = anchor?.getAttribute('data-md-href');
    if (!href || !renderedFile) return;
    const target = resolveMarkdownLink(renderedFile.path, href);
    if (target.kind === 'external') backend.openExternalURL(target.url);
    else if (target.kind === 'repo-file') void openLinkedFile(target.path);
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
            onSelectFile={entry => void selectFile(entry.path)}
            onRetryDirectory={path => void loadDirectory(path)}
          />
        </div>
        <div title={repo.path} style={{ padding: '7px 10px', borderTop: `1px solid ${C.border}`, color: C.textWeak, fontSize: 10, fontFamily: 'JetBrains Mono, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {repo.path}
        </div>
      </div>

      <div style={{ position: 'relative', flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', background: C.appBg }}>
        <FilePreview
          active={active}
          state={fileState}
          renderedFile={renderedFile}
          notice={renderNotice}
          markdownView={markdownView}
          onMarkdownViewChange={setMarkdownView}
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

function FilePreview({
  active,
  state,
  renderedFile,
  notice,
  markdownView,
  onMarkdownViewChange,
  onPreviewClick,
}: {
  active: boolean;
  state: FileState;
  renderedFile: RenderedFile | null;
  notice: string | null;
  markdownView: MarkdownView;
  onMarkdownViewChange: (view: MarkdownView) => void;
  onPreviewClick: (event: ReactMouseEvent<HTMLDivElement>) => void;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOptions, setSearchOptions] = useState<FileSearchOptions>({ caseSensitive: false, wholeWord: false, useRegex: false });
  const [activeMatchIndex, setActiveMatchIndex] = useState(-1);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const activeMatchRef = useRef<HTMLElement | null>(null);
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

  if (state.status === 'idle') {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10, color: C.textWeak }}>
        <FileText size={30} strokeWidth={1.4} />
        <span style={{ fontSize: 12 }}>从左侧选择文件以查看内容</span>
      </div>
    );
  }

  const path = state.status === 'loaded' ? state.file.path : state.path;
  const kind = file ? detectPreviewKind(file.path) : 'text';
  const activeHtml = file && renderedFile && renderedFile.path === file.path ? renderedFile.html : null;
  const showSearchText = Boolean(file && searchOpen && searchQuery && !searchResult.error);
  const showMarkdownPreview = !showSearchText && kind === 'markdown' && activeHtml !== null && markdownView === 'preview';
  const showHighlightedCode = !showSearchText && kind === 'code' && activeHtml !== null;

  return (
    <>
      <div style={{ height: 34, padding: '0 12px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: `1px solid ${C.border}`, background: C.panel1, color: C.textSecondary, flexShrink: 0 }}>
        <File size={13} color={C.textWeak} />
        <span title={path} style={{ minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}>{path}</span>
        {notice && <span title={notice} style={{ color: C.textWeak, fontSize: 10, flexShrink: 0, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{notice}</span>}
        {kind === 'markdown' && activeHtml !== null && (
          <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
            <ViewModeButton active={markdownView === 'preview'} label="预览" onClick={() => onMarkdownViewChange('preview')} />
            <ViewModeButton active={markdownView === 'raw'} label="原文" onClick={() => onMarkdownViewChange('raw')} />
          </div>
        )}
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
          onActiveMatch={element => { activeMatchRef.current = element; }}
        />
      )}
      {file && showMarkdownPreview && (
        <div style={previewBodyStyle}>
          <div className="file-preview-markdown" onClick={onPreviewClick} dangerouslySetInnerHTML={{ __html: activeHtml ?? '' }} />
        </div>
      )}
      {file && !showMarkdownPreview && showHighlightedCode && (
        <pre style={previewBodyStyle}>
          <code className="hljs" style={codeTextStyle} dangerouslySetInnerHTML={{ __html: activeHtml ?? '' }} />
        </pre>
      )}
      {file && !showSearchText && !showMarkdownPreview && !showHighlightedCode && (
        <pre style={previewBodyStyle}>
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
  onActiveMatch,
}: {
  content: string;
  matches: FileSearchMatch[];
  activeIndex: number;
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

  return <pre style={{ ...previewBodyStyle, ...codeTextStyle }}>{nodes}</pre>;
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
