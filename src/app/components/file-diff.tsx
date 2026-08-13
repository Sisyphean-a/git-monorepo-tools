import { useCallback, useEffect, useMemo, useRef, useState, type UIEvent } from 'react';
import { C } from '../theme';
import type { FileChange } from '../domain/types';
import { fileDiffKey, type FileDiffLoader } from '../features/diff/file-diff-loader';
import {
  calculateDiffViewport,
  DIFF_LINE_HEIGHT,
  DIFF_VIEWPORT_HEIGHT,
} from '../features/diff/diff-viewport';

interface FileDiffPanelProps {
  file: FileChange;
  loader: FileDiffLoader;
}

type DiffState =
  | { status: 'loading' }
  | { status: 'ready'; content: string }
  | { status: 'error'; message: string };

function diffLineStyle(line: string) {
  if (line.startsWith('@@')) {
    return { color: C.needPull, background: `${C.needPull}12` };
  }
  if (line.startsWith('+') && !line.startsWith('+++')) {
    return { color: C.added, background: `${C.added}10` };
  }
  if (line.startsWith('-') && !line.startsWith('---')) {
    return { color: C.deleted, background: `${C.deleted}10` };
  }
  if (line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++')) {
    return { color: C.textWeak, background: 'transparent' };
  }
  return { color: C.textSecondary, background: 'transparent' };
}

function renderedColumns(line: string) {
  let columns = 0;
  for (const character of line) {
    columns += character === '\t' ? 4 - (columns % 4) : 1;
  }
  return columns;
}

function diffWidth(lines: string[]) {
  return lines.reduce((widest, line) => Math.max(widest, renderedColumns(line)), 1);
}

function useVirtualScrollTop() {
  const [scrollTop, setScrollTop] = useState(0);
  const animationFrame = useRef<number | null>(null);
  const handleScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    const nextScrollTop = event.currentTarget.scrollTop;
    if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current);
    animationFrame.current = requestAnimationFrame(() => {
      animationFrame.current = null;
      setScrollTop(nextScrollTop);
    });
  }, []);

  useEffect(() => () => {
    if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current);
  }, []);
  return { scrollTop, handleScroll };
}

function DiffContent({ content }: { content: string }) {
  const lines = useMemo(() => content ? content.split(/\r?\n/) : [], [content]);
  const width = useMemo(() => diffWidth(lines), [lines]);
  const { scrollTop, handleScroll } = useVirtualScrollTop();
  const viewport = calculateDiffViewport({ lineCount: lines.length, scrollTop });

  if (!content) {
    return <div style={{ padding: 14, color: C.textWeak, fontSize: 11 }}>当前文件没有可显示的文本差异</div>;
  }
  const visibleLines = lines.slice(viewport.start, viewport.end);

  return (
    <div
      role="region"
      aria-label="代码差异"
      onScroll={handleScroll}
      style={{ maxHeight: DIFF_VIEWPORT_HEIGHT, overflow: 'auto', overscrollBehavior: 'contain' }}
    >
      <div style={{ position: 'relative', height: viewport.totalHeight, minWidth: '100%', width: `${width}ch`, fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>
        <div style={{ position: 'absolute', top: viewport.offsetTop, left: 0, right: 0 }}>
          {visibleLines.map((line, index) => (
            <div key={viewport.start + index} style={{ ...diffLineStyle(line), height: DIFF_LINE_HEIGHT, lineHeight: `${DIFF_LINE_HEIGHT}px`, padding: '0 12px', whiteSpace: 'pre', boxSizing: 'border-box' }}>
              {line || ' '}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function FileDiffPanel({ file, loader }: FileDiffPanelProps) {
  const revision = fileDiffKey(file);
  const [state, setState] = useState<DiffState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    setState({ status: 'loading' });
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
    };
  }, [revision, loader]);

  return (
    <div style={{ margin: '0 10px 8px', border: `1px solid ${C.border}`, borderRadius: 6, background: C.appBg, overflow: 'hidden' }}>
      {state.status === 'loading' && <div style={{ padding: 14, color: C.textWeak, fontSize: 11 }}>正在读取代码差异…</div>}
      {state.status === 'error' && <div style={{ padding: 14, color: C.deleted, fontSize: 11 }}>{state.message}</div>}
      {state.status === 'ready' && <DiffContent content={state.content} />}
    </div>
  );
}
