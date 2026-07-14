import { useEffect, useState } from 'react';
import { C } from '../theme';
import type { FileChange, FileDiff } from '../types';

interface FileDiffPanelProps {
  file: FileChange;
  loadDiff: (file: FileChange) => Promise<FileDiff>;
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

function DiffContent({ content }: { content: string }) {
  if (!content) {
    return <div style={{ padding: 14, color: C.textWeak, fontSize: 11 }}>当前文件没有可显示的文本差异</div>;
  }
  return (
    <div style={{ minWidth: 'max-content', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, lineHeight: 1.55 }}>
      {content.split('\n').map((line, index) => (
        <div key={`${index}-${line.slice(0, 16)}`} style={{ ...diffLineStyle(line), minHeight: 17, padding: '0 12px', whiteSpace: 'pre' }}>
          {line || ' '}
        </div>
      ))}
    </div>
  );
}

export function FileDiffPanel({ file, loadDiff }: FileDiffPanelProps) {
  const [state, setState] = useState<DiffState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    setState({ status: 'loading' });
    void loadDiff(file).then(
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
  }, [file, loadDiff]);

  return (
    <div style={{ margin: '0 10px 8px', border: `1px solid ${C.border}`, borderRadius: 6, background: C.appBg, overflow: 'auto', maxHeight: 360 }}>
      {state.status === 'loading' && <div style={{ padding: 14, color: C.textWeak, fontSize: 11 }}>正在读取代码差异…</div>}
      {state.status === 'error' && <div style={{ padding: 14, color: C.deleted, fontSize: 11 }}>{state.message}</div>}
      {state.status === 'ready' && <DiffContent content={state.content} />}
    </div>
  );
}
