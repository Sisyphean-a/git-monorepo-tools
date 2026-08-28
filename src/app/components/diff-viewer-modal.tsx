import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject, type UIEvent } from 'react';
import { Check, GitCompare, X } from 'lucide-react';
import { useAppBackend } from '../application/backend-context';
import { C } from '../theme';
import type { AppSettings, CommitDetail, DiffViewerRequest, FileChange, RepoDetail } from '../domain/types';
import { buildDiffRowOffsets, calculateVariableDiffViewport, DIFF_LINE_HEIGHT } from '../features/diff/diff-viewport';
import { chooseDefaultWorkingDiffMode, filterWorkingDiffFiles, type WorkingDiffMode } from '../features/diff/diff-viewer-state';
import { createFileDiffLoader, type FileDiffLoader } from '../features/diff/file-diff-loader';
import { countWrappedLineRows, filterSideBySideDisplayRows, parseSideBySideDiff, type SideBySideCell, type SideBySideRow } from '../features/diff/side-by-side';

interface DiffViewerModalProps {
  request: DiffViewerRequest | null;
  repo: RepoDetail | null;
  settings: AppSettings;
  onClose: () => void;
}

type DiffLoadState =
  | { status: 'loading' }
  | { status: 'ready'; content: string }
  | { status: 'error'; message: string };

export function DiffViewerModal({ request, repo, settings, onClose }: DiffViewerModalProps) {
  const backend = useAppBackend();
  const open = request !== null;
  const requestKey = request ? `${request.kind}:${request.repoId}:${request.kind === 'commit' ? request.commitHash : ''}` : '';
  const repoPath = repo?.path ?? '';
  const repoCategory = repo?.category ?? '';
  const repoAvailable = repo !== null;
  const [workingFiles, setWorkingFiles] = useState<FileChange[]>([]);
  const [commitDetail, setCommitDetail] = useState<CommitDetail | null>(null);
  const [workingMode, setWorkingMode] = useState<WorkingDiffMode>('unstaged');
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(() => new Set());
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !request) {
      setWorkingFiles([]);
      setCommitDetail(null);
      setWorkingMode('unstaged');
      setSelectedFileId(null);
      setReviewedIds(new Set());
      setSearch('');
      setLoading(false);
      setLoadError(null);
      return;
    }

    let active = true;
    const currentRequest = request;
    const initialWorkingFiles = currentRequest.kind === 'working'
      ? (repo?.files ?? []).filter(file => !file.untracked)
      : [];
    setWorkingFiles(initialWorkingFiles);
    setCommitDetail(currentRequest.kind === 'commit' ? currentRequest.commitDetail ?? null : null);
    setWorkingMode(currentRequest.kind === 'working' ? chooseDefaultWorkingDiffMode(initialWorkingFiles) : 'unstaged');
    setSelectedFileId(null);
    setReviewedIds(new Set());
    setSearch('');
    setLoading(true);
    setLoadError(null);

    if (!repo) {
      setLoading(false);
      setLoadError('当前仓库不可用');
      return () => {
        active = false;
      };
    }

    if (currentRequest.kind === 'commit' && currentRequest.commitDetail) {
      setLoading(false);
      return () => {
        active = false;
      };
    }

    const load = currentRequest.kind === 'working'
      ? backend.fetchWorkingDiffFiles({
        repoId: currentRequest.repoId,
        settings,
        target: { path: repoPath, category: repoCategory },
      }).then(files => {
        if (!active) return;
        setWorkingFiles(files);
        setWorkingMode(chooseDefaultWorkingDiffMode(files));
      })
      : backend.fetchCommitDetail({ repoId: currentRequest.repoId, hash: currentRequest.commitHash, settings })
        .then(detail => {
          if (!active) return;
          setCommitDetail(detail);
        });

    void load.catch(error => {
      if (active) setLoadError(error instanceof Error ? error.message : '差异来源加载失败');
    }).finally(() => {
      if (active) setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [backend, open, requestKey, repoAvailable, repoCategory, repoPath, settings]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  const commitFiles = useMemo(() => {
    if (!commitDetail) return [];
    if (commitDetail.changedFiles?.length) return commitDetail.changedFiles;
    return (commitDetail.filesChanged ?? []).map(path => ({
      id: `${path}::commit`,
      status: 'M' as const,
      path,
      additions: 0,
      deletions: 0,
      size: '',
      previousPath: undefined,
      staged: false,
    }));
  }, [commitDetail]);

  const files = useMemo(
    () => request?.kind === 'commit' ? commitFiles : filterWorkingDiffFiles(workingFiles, workingMode),
    [commitFiles, request?.kind, workingFiles, workingMode],
  );
  const visibleFiles = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? files.filter(file => file.path.toLowerCase().includes(query)) : files;
  }, [files, search]);

  useEffect(() => {
    setSelectedFileId(current => files.some(file => file.id === current) ? current : files[0]?.id ?? null);
  }, [files]);

  const selectedFile = !loading && !loadError ? files.find(file => file.id === selectedFileId) ?? null : null;
  const diffLoader = useMemo<FileDiffLoader | null>(() => {
    if (!request || !repoAvailable) return null;
    const currentRequest = request;
    return createFileDiffLoader(file => backend.fetchFileDiff({
      repoId: currentRequest.repoId,
      filePath: file.path,
      previousPath: file.previousPath,
      status: file.status,
      staged: currentRequest.kind === 'working' && workingMode === 'staged',
      untracked: false,
      commitHash: currentRequest.kind === 'commit' ? currentRequest.commitHash : undefined,
      settings,
      target: { path: repoPath, category: repoCategory },
    }));
  }, [backend, repoAvailable, repoCategory, repoPath, requestKey, settings, workingMode]);

  if (!open || !request) return null;

  const isWorking = request.kind === 'working';
  const stagedCount = filterWorkingDiffFiles(workingFiles, 'staged').length;
  const unstagedCount = filterWorkingDiffFiles(workingFiles, 'unstaged').length;
  const reviewedCount = files.filter(file => reviewedIds.has(file.id)).length;
  const sourceLabel = isWorking
    ? workingMode === 'staged' ? '暂存变更' : '未暂存变更'
    : `历史提交 · ${commitDetail?.shortHash ?? request.commitHash.slice(0, 8)}`;

  const changeWorkingMode = (nextMode: WorkingDiffMode) => {
    if (!isWorking || nextMode === workingMode) return;
    setWorkingMode(nextMode);
    setSelectedFileId(null);
    setReviewedIds(new Set());
  };
  const toggleReviewed = (fileId: string) => {
    setReviewedIds(current => {
      const next = new Set(current);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  };

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.68)', zIndex: 90, backdropFilter: 'blur(3px)' }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="代码差异查看器"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(1480px, 96vw)',
          height: 'min(900px, 94vh)',
          background: C.panel1,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          zIndex: 91,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 25px 70px rgba(0,0,0,0.55)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          <GitCompare size={16} color={C.btnPrimary} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ color: C.textPrimary, fontSize: 14, fontWeight: 600 }}>代码差异</div>
            <div style={{ color: C.textWeak, fontSize: 10, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {repo?.name ?? '当前仓库'} · {sourceLabel}
            </div>
          </div>
          {isWorking ? (
            <div style={{ display: 'flex', gap: 6 }}>
              <SourceButton active={workingMode === 'unstaged'} disabled={loading || unstagedCount === 0} onClick={() => changeWorkingMode('unstaged')}>
                未暂存变更 {unstagedCount}
              </SourceButton>
              <SourceButton active={workingMode === 'staged'} disabled={loading || stagedCount === 0} onClick={() => changeWorkingMode('staged')}>
                暂存变更 {stagedCount}
              </SourceButton>
            </div>
          ) : (
            <div style={{ color: C.textSecondary, fontSize: 11, background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 9px' }}>
              {commitDetail?.message ?? '正在加载提交…'}
            </div>
          )}
          <button onClick={onClose} aria-label="关闭代码差异" title="关闭" style={{ background: 'none', border: 'none', color: C.textWeak, cursor: 'pointer', padding: 4, display: 'flex' }}>
            <X size={17} />
          </button>
        </div>

        <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
          <aside style={{ width: 330, flexShrink: 0, minHeight: 0, display: 'flex', flexDirection: 'column', borderRight: `1px solid ${C.border}`, background: C.panel1 }}>
            <div style={{ padding: 10, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
              <input
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="搜索文件路径"
                aria-label="搜索文件路径"
                style={{ width: '100%', boxSizing: 'border-box', background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 6, padding: '7px 9px', color: C.textPrimary, fontSize: 11, outline: 'none' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, color: C.textWeak, fontSize: 10 }}>
                <span>{files.length} 个文件</span>
                <span>{reviewedCount} 个已查看</span>
              </div>
            </div>
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              {loading && <div style={{ padding: '8px 10px', color: C.textWeak, fontSize: 10, textAlign: 'center', borderBottom: `1px solid ${C.border}` }}>正在同步 Git 状态…</div>}
              {!loading && loadError && <div style={{ padding: 18, color: C.deleted, fontSize: 11, lineHeight: 1.5 }}>{loadError}</div>}
              {!loadError && (
                <DiffFileList
                  files={visibleFiles}
                  loading={loading}
                  emptyMessage={files.length === 0 ? '当前来源没有可显示的变更' : '没有匹配的文件'}
                  selectedFileId={selectedFileId}
                  reviewedIds={reviewedIds}
                  onSelect={setSelectedFileId}
                  onToggleReviewed={toggleReviewed}
                />
              )}
            </div>
          </aside>

          <section style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', background: C.appBg }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 43, padding: '8px 14px', borderBottom: `1px solid ${C.border}`, background: C.panel1, flexShrink: 0 }}>
              {selectedFile ? (
                <>
                  <StatusTag status={selectedFile.status} />
                  <span title={selectedFile.previousPath ? `${selectedFile.previousPath} → ${selectedFile.path}` : selectedFile.path} style={{ flex: 1, minWidth: 0, color: C.textPrimary, fontSize: 12, fontFamily: 'JetBrains Mono, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedFile.previousPath ? `${selectedFile.previousPath} → ${selectedFile.path}` : selectedFile.path}</span>
                  <span style={{ color: C.added, fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}>+{selectedFile.additions}</span>
                  <span style={{ color: C.deleted, fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}>-{selectedFile.deletions}</span>
                  <button onClick={() => toggleReviewed(selectedFile.id)} style={reviewButtonStyle(reviewedIds.has(selectedFile.id))}>
                    <Check size={11} /> {reviewedIds.has(selectedFile.id) ? '已查看' : '标记已查看'}
                  </button>
                </>
              ) : (
                <span style={{ color: C.textWeak, fontSize: 11 }}>{loading ? '正在读取…' : '从左侧选择文件查看差异'}</span>
              )}
            </div>
            <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
              {selectedFile && diffLoader ? (
                <SideBySideDiff key={`${requestKey}:${workingMode}:${selectedFile.id}`} file={selectedFile} loader={diffLoader} />
              ) : (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textWeak, fontSize: 11 }}>
                  {loadError ? '无法加载差异' : '选择一个文件开始查看'}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

function SourceButton({ active, disabled, onClick, children }: { active: boolean; disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        background: active ? C.selectedBg : C.panel2,
        border: `1px solid ${active ? C.btnPrimary : C.border}`,
        color: disabled ? C.textWeak : active ? C.textPrimary : C.textSecondary,
        borderRadius: 6,
        padding: '6px 9px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 10,
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {children}
    </button>
  );
}

const DIFF_FILE_ROW_HEIGHT = 36;
const DIFF_FILE_OVERSCAN = 8;

function DiffFileList({ files, loading, emptyMessage, selectedFileId, reviewedIds, onSelect, onToggleReviewed }: {
  files: FileChange[];
  loading: boolean;
  emptyMessage: string;
  selectedFileId: string | null;
  reviewedIds: Set<string>;
  onSelect: (fileId: string) => void;
  onToggleReviewed: (fileId: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollFrame = useRef<number | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(360);

  useEffect(() => {
    if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current);
    scrollFrame.current = null;
    setScrollTop(0);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [files]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const updateHeight = () => setViewportHeight(node.clientHeight || 360);
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => () => {
    if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current);
  }, []);

  const handleScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    const nextScrollTop = event.currentTarget.scrollTop;
    if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current);
    scrollFrame.current = requestAnimationFrame(() => {
      scrollFrame.current = null;
      setScrollTop(nextScrollTop);
    });
  }, []);
  const viewport = calculateFileListViewport(files.length, scrollTop, viewportHeight);

  if (files.length === 0) {
    return <div style={{ padding: 24, color: C.textWeak, fontSize: 11, textAlign: 'center' }}>{loading ? ' ' : emptyMessage}</div>;
  }

  return (
    <div ref={scrollRef} onScroll={handleScroll} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 0' }}>
      <div style={{ position: 'relative', height: viewport.totalHeight }}>
        <div style={{ position: 'absolute', top: viewport.offsetTop, left: 0, right: 0 }}>
          {files.slice(viewport.start, viewport.end).map(file => (
            <DiffFileRow
              key={file.id}
              file={file}
              selected={!loading && file.id === selectedFileId}
              reviewed={reviewedIds.has(file.id)}
              disabled={loading}
              onSelect={() => onSelect(file.id)}
              onToggleReviewed={() => onToggleReviewed(file.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function calculateFileListViewport(lineCount: number, scrollTop: number, viewportHeight: number) {
  const count = Math.max(0, Math.floor(lineCount));
  const height = Math.max(0, viewportHeight);
  const maxScrollTop = Math.max(0, count * DIFF_FILE_ROW_HEIGHT - height);
  const boundedScrollTop = Math.min(Math.max(0, scrollTop), maxScrollTop);
  const firstVisible = Math.floor(boundedScrollTop / DIFF_FILE_ROW_HEIGHT);
  const visibleRows = Math.ceil(height / DIFF_FILE_ROW_HEIGHT);
  const start = Math.max(0, firstVisible - DIFF_FILE_OVERSCAN);
  const end = Math.min(count, firstVisible + visibleRows + DIFF_FILE_OVERSCAN);
  return {
    start,
    end,
    offsetTop: start * DIFF_FILE_ROW_HEIGHT,
    totalHeight: count * DIFF_FILE_ROW_HEIGHT,
  };
}

function DiffFileRow({ file, selected, reviewed, disabled, onSelect, onToggleReviewed }: { file: FileChange; selected: boolean; reviewed: boolean; disabled: boolean; onSelect: () => void; onToggleReviewed: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', gap: 4, height: DIFF_FILE_ROW_HEIGHT, boxSizing: 'border-box', padding: '2px 6px 2px 8px', background: selected ? C.selectedBg : 'transparent', borderLeft: `2px solid ${selected ? C.btnPrimary : 'transparent'}`, opacity: disabled ? 0.7 : 1 }}>
      <button type="button" disabled={disabled} onClick={onSelect} aria-current={selected ? 'true' : undefined} style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 7, background: 'none', border: 'none', color: C.textSecondary, cursor: disabled ? 'wait' : 'pointer', padding: '8px 3px', textAlign: 'left' }}>
        <StatusTag status={file.status} />
        <span title={file.previousPath ? `${file.previousPath} → ${file.path}` : file.path} style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: file.status === 'D' ? C.deleted : C.textPrimary, textDecoration: file.status === 'D' ? 'line-through' : 'none' }}>
          {file.previousPath ? `${file.previousPath} → ${file.path}` : file.path}
        </span>
        <span style={{ flexShrink: 0, display: 'flex', gap: 4, fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}>
          {file.additions > 0 && <span style={{ color: C.added }}>+{file.additions}</span>}
          {file.deletions > 0 && <span style={{ color: C.deleted }}>-{file.deletions}</span>}
        </span>
      </button>
      <button type="button" disabled={disabled} onClick={onToggleReviewed} aria-label={reviewed ? '取消已查看' : '标记已查看'} title={reviewed ? '取消已查看' : '标记已查看'} style={{ alignSelf: 'center', background: 'none', border: 'none', color: reviewed ? C.added : C.textWeak, cursor: disabled ? 'wait' : 'pointer', padding: 5, display: 'flex' }}>
        <Check size={12} />
      </button>
    </div>
  );
}

function StatusTag({ status }: { status: FileChange['status'] }) {
  const color = status === 'A' ? C.added : status === 'D' ? C.deleted : status === 'R' ? C.needPull : C.modified;
  return <span style={{ flexShrink: 0, width: 18, color, background: `${color}20`, borderRadius: 3, padding: '2px 3px', textAlign: 'center', fontSize: 9, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>{status}</span>;
}

function reviewButtonStyle(reviewed: boolean) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
    background: reviewed ? `${C.added}18` : C.panel2,
    border: `1px solid ${reviewed ? `${C.added}55` : C.border}`,
    color: reviewed ? C.added : C.textSecondary,
    borderRadius: 5,
    padding: '4px 7px',
    cursor: 'pointer',
    fontSize: 10,
  } as const;
}

const DIFF_LINE_NUMBER_WIDTH = 42;
const DIFF_CELL_HORIZONTAL_PADDING = 20;
const DIFF_DEFAULT_CHARACTER_WIDTH = 7;

function measureDiffCharacterWidth() {
  if (typeof document === 'undefined') return DIFF_DEFAULT_CHARACTER_WIDTH;
  const context = document.createElement('canvas').getContext('2d');
  if (!context) return DIFF_DEFAULT_CHARACTER_WIDTH;
  context.font = '11px "JetBrains Mono", monospace';
  return context.measureText('0').width || DIFF_DEFAULT_CHARACTER_WIDTH;
}

function SideBySideDiff({ file, loader }: { file: FileChange; loader: FileDiffLoader }) {
  const leftScrollRef = useRef<HTMLDivElement>(null);
  const rightScrollRef = useRef<HTMLDivElement>(null);
  const scrollFrame = useRef<number | null>(null);
  const pendingScrollTop = useRef(0);
  const currentScrollTop = useRef(0);
  const [state, setState] = useState<DiffLoadState>({ status: 'loading' });
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(560);
  const [wrapColumns, setWrapColumns] = useState({ left: 72, right: 72 });
  const [measuredRowHeights, setMeasuredRowHeights] = useState<Map<number, number>>(() => new Map());
  const reportRowHeight = useCallback((rowIndex: number, height: number) => {
    setMeasuredRowHeights(previous => {
      const current = previous.get(rowIndex) ?? 0;
      if (height <= current) return previous;
      const next = new Map(previous);
      next.set(rowIndex, height);
      return next;
    });
  }, []);

  useEffect(() => {
    let active = true;
    setState({ status: 'loading' });
    setScrollTop(0);
    currentScrollTop.current = 0;
    pendingScrollTop.current = 0;
    if (leftScrollRef.current) leftScrollRef.current.scrollTop = 0;
    if (rightScrollRef.current) rightScrollRef.current.scrollTop = 0;
    void loader.load(file).then(
      diff => {
        if (active) setState({ status: 'ready', content: diff.content });
      },
      error => {
        if (active) setState({ status: 'error', message: error instanceof Error ? error.message : '差异加载失败' });
      },
    );
    return () => {
      active = false;
      if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current);
    };
  }, [file, loader]);

  useEffect(() => {
    if (state.status !== 'ready') return;
    const leftNode = leftScrollRef.current;
    const rightNode = rightScrollRef.current;
    if (!leftNode || !rightNode) return;
    const characterWidth = measureDiffCharacterWidth();
    const toColumns = (node: HTMLDivElement) => Math.max(1, Math.floor((node.clientWidth - DIFF_LINE_NUMBER_WIDTH - DIFF_CELL_HORIZONTAL_PADDING) / characterWidth));
    const updateSize = () => {
      setViewportHeight(Math.min(leftNode.clientHeight || 560, rightNode.clientHeight || 560));
      const nextWrapColumns = { left: toColumns(leftNode), right: toColumns(rightNode) };
      setWrapColumns(previous => previous.left === nextWrapColumns.left && previous.right === nextWrapColumns.right ? previous : nextWrapColumns);
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(leftNode);
    observer.observe(rightNode);
    return () => observer.disconnect();
  }, [state.status]);

  const handleScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    const nextScrollTop = event.currentTarget.scrollTop;
    if (nextScrollTop === currentScrollTop.current) return;
    pendingScrollTop.current = nextScrollTop;
    if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current);
    scrollFrame.current = requestAnimationFrame(() => {
      scrollFrame.current = null;
      const next = pendingScrollTop.current;
      currentScrollTop.current = next;
      setScrollTop(next);
      [leftScrollRef.current, rightScrollRef.current].forEach(node => {
        if (node && node.scrollTop !== next) node.scrollTop = next;
      });
    });
  }, []);
  const rows = useMemo(() => state.status === 'ready' ? filterSideBySideDisplayRows(parseSideBySideDiff(state.content)) : [], [state]);
  const rowHeights = useMemo(() => rows.map((row, index) => {
    if (row.kind !== 'lines') return DIFF_LINE_HEIGHT;
    const leftRows = countWrappedLineRows(row.left.text, wrapColumns.left);
    const rightRows = countWrappedLineRows(row.right.text, wrapColumns.right);
    const estimatedHeight = Math.max(leftRows, rightRows) * DIFF_LINE_HEIGHT;
    return Math.max(estimatedHeight, measuredRowHeights.get(index) ?? 0);
  }), [rows, wrapColumns, measuredRowHeights]);
  const rowOffsets = useMemo(() => buildDiffRowOffsets(rowHeights), [rowHeights]);
  const viewport = calculateVariableDiffViewport({ rowOffsets, scrollTop, viewportHeight });

  return (
    <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '50% 50%', flexShrink: 0, height: 28, lineHeight: '28px', color: C.textWeak, background: C.panel1, borderBottom: `1px solid ${C.border}`, fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}>
        <div style={{ paddingLeft: 12, borderRight: `1px solid ${C.border}` }}>旧版本 / 左侧</div>
        <div style={{ paddingLeft: 12 }}>新版本 / 右侧</div>
      </div>
      {state.status === 'loading' && <div style={{ flex: 1, padding: 18, color: C.textWeak, fontSize: 11 }}>正在读取代码差异…</div>}
      {state.status === 'error' && <div style={{ flex: 1, padding: 18, color: C.deleted, fontSize: 11 }}>{state.message}</div>}
      {state.status === 'ready' && (
        <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '50% 50%' }}>
          <DiffColumn
            side="left"
            rows={rows}
            viewport={viewport}
            rowOffsets={rowOffsets}
            scrollRef={leftScrollRef}
            onScroll={handleScroll}
            onRowResize={reportRowHeight}
          />
          <DiffColumn
            side="right"
            rows={rows}
            viewport={viewport}
            rowOffsets={rowOffsets}
            scrollRef={rightScrollRef}
            onScroll={handleScroll}
            onRowResize={reportRowHeight}
          />
        </div>
      )}
    </div>
  );
}

function DiffColumn({ side, rows, viewport, rowOffsets, scrollRef, onScroll, onRowResize }: {
  side: 'left' | 'right';
  rows: SideBySideRow[];
  viewport: ReturnType<typeof calculateVariableDiffViewport>;
  rowOffsets: number[];
  scrollRef: RefObject<HTMLDivElement>;
  onScroll: (event: UIEvent<HTMLDivElement>) => void;
  onRowResize: (rowIndex: number, height: number) => void;
}) {
  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      role="region"
      aria-label={side === 'left' ? '旧版本代码差异' : '新版本代码差异'}
      style={{ minWidth: 0, minHeight: 0, overflow: 'auto', overscrollBehavior: 'contain', scrollbarGutter: 'stable', borderRight: side === 'left' ? `1px solid ${C.border}` : undefined }}
    >
      <div style={{ position: 'relative', minWidth: '100%', width: '100%', height: viewport.totalHeight, fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>
        <div style={{ position: 'absolute', top: viewport.offsetTop, left: 0, right: 0 }}>
          {rows.slice(viewport.start, viewport.end).map((row, index) => {
            const rowIndex = viewport.start + index;
            const rowTop = rowOffsets[rowIndex] ?? 0;
            const rowHeight = (rowOffsets[rowIndex + 1] ?? rowTop + DIFF_LINE_HEIGHT) - rowTop;
            return <SideColumnRowView key={rowIndex} row={row} side={side} height={rowHeight} rowIndex={rowIndex} onResize={onRowResize} />;
          })}
        </div>
      </div>
    </div>
  );
}

function SideColumnRowView({ row, side, height, rowIndex, onResize }: { row: SideBySideRow; side: 'left' | 'right'; height: number; rowIndex: number; onResize: (rowIndex: number, height: number) => void }) {
  const rowRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const node = rowRef.current;
    if (!node) return;
    const report = () => onResize(rowIndex, Math.ceil(node.getBoundingClientRect().height));
    report();
    const observer = new ResizeObserver(report);
    observer.observe(node);
    return () => observer.disconnect();
  }, [height, onResize, rowIndex]);

  return (
    <div ref={rowRef} style={{ minHeight: height }}>
      {row.kind === 'meta' && <DiffSpecialRow text={side === 'left' ? row.text : ''} color={C.textWeak} background={C.panel1} minHeight={height} />}
      {row.kind === 'hunk' && <DiffSpecialRow text={side === 'left' ? row.text : ''} color={C.needPull} background={`${C.needPull}12`} minHeight={height} />}
      {row.kind === 'lines' && <DiffCell cell={side === 'left' ? row.left : row.right} minHeight={height} />}
    </div>
  );
}

function DiffSpecialRow({ text, color, background, minHeight }: { text: string; color: string; background: string; minHeight: number }) {
  return <div style={{ width: '100%', minWidth: '100%', minHeight, lineHeight: `${DIFF_LINE_HEIGHT}px`, padding: '0 12px', color, background, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', boxSizing: 'border-box' }}>{text || ' '}</div>;
}

function DiffCell({ cell, minHeight }: { cell: SideBySideCell; minHeight: number }) {
  const isAdded = cell.kind === 'added';
  const isDeleted = cell.kind === 'deleted';
  const background = isAdded ? `${C.added}16` : isDeleted ? `${C.deleted}16` : cell.kind === 'empty' ? `${C.panel1}80` : 'transparent';
  const color = isAdded ? C.added : isDeleted ? C.deleted : cell.kind === 'empty' ? C.textWeak : C.textSecondary;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', width: '100%', minWidth: '100%', minHeight, boxSizing: 'border-box', lineHeight: `${DIFF_LINE_HEIGHT}px`, background, color, borderBottom: `1px solid ${C.border}20` }}>
      <span style={{ position: 'sticky', left: 0, zIndex: 1, alignSelf: 'stretch', flexShrink: 0, width: DIFF_LINE_NUMBER_WIDTH, paddingRight: 8, boxSizing: 'border-box', textAlign: 'right', color: cell.kind === 'empty' ? C.textWeak : `${color}99`, background, userSelect: 'none' }}>{cell.lineNumber ?? ''}</span>
      <span style={{ display: 'block', flex: 1, minWidth: 0, padding: '0 10px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'break-word', tabSize: 4 }}>{cell.text || ' '}</span>
    </div>
  );
}
