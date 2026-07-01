import { useState } from 'react';
import { AlertCircle, AlignLeft, Columns2 } from 'lucide-react';
import { C } from '../theme';
import type { RepoDiff } from '../types';

interface DiffPreviewProps {
  diff: RepoDiff | null;
  loading: boolean;
}

function DiffFileHeader({
  diff,
  viewMode,
  setViewMode,
}: {
  diff: RepoDiff;
  viewMode: 'unified' | 'split';
  setViewMode: (mode: 'unified' | 'split') => void;
}) {
  const file = diff.file;
  if (!file) return null;
  const parts = file.path.split('/');
  const fname = parts.pop() ?? '';
  const dir = parts.join('/');

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 14px',
        background: C.panel2,
        borderBottom: `1px solid ${C.border}`,
        flexShrink: 0,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ marginBottom: 2 }}>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: C.textWeak }}>{dir ? `${dir}/` : ''}</span>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: C.textPrimary, fontWeight: 500 }}>{fname}</span>
        </div>
        <div style={{ color: C.textWeak, fontSize: 10 }}>
          {diff.view === 'staged' ? '已暂存视图' : '未暂存视图'} · +{file.additions} -{file.deletions} · {file.size}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 2, background: C.panel1, borderRadius: 5, padding: 2 }}>
        <button
          onClick={() => setViewMode('unified')}
          style={{
            background: viewMode === 'unified' ? C.panel2 : 'transparent',
            border: `1px solid ${viewMode === 'unified' ? C.border : 'transparent'}`,
            color: viewMode === 'unified' ? C.textPrimary : C.textWeak,
            borderRadius: 4,
            padding: '3px 7px',
            cursor: 'pointer',
            fontSize: 11,
            display: 'flex',
            alignItems: 'center',
            gap: 3,
          }}
        >
          <AlignLeft size={11} /> 统一
        </button>
        <button
          onClick={() => setViewMode('split')}
          style={{
            background: viewMode === 'split' ? C.panel2 : 'transparent',
            border: `1px solid ${viewMode === 'split' ? C.border : 'transparent'}`,
            color: viewMode === 'split' ? C.textPrimary : C.textWeak,
            borderRadius: 4,
            padding: '3px 7px',
            cursor: 'pointer',
            fontSize: 11,
            display: 'flex',
            alignItems: 'center',
            gap: 3,
          }}
        >
          <Columns2 size={11} /> 分栏
        </button>
      </div>
    </div>
  );
}

export function DiffPreview({ diff, loading }: DiffPreviewProps) {
  const [viewMode, setViewMode] = useState<'unified' | 'split'>('unified');

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.appBg }}>
        <div style={{ textAlign: 'center', color: C.textWeak, fontSize: 13 }}>正在加载真实 Diff…</div>
      </div>
    );
  }

  if (!diff?.file) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.appBg }}>
        <div style={{ textAlign: 'center', color: C.textWeak, fontSize: 13 }}>选择文件以查看 Diff</div>
      </div>
    );
  }

  if (diff.file.status === 'D') {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: C.appBg, overflow: 'hidden' }}>
        <DiffFileHeader diff={diff} viewMode={viewMode} setViewMode={setViewMode} />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', color: C.deleted, fontSize: 13 }}>
            <AlertCircle size={24} style={{ marginBottom: 8, opacity: 0.7 }} />
            <div>文件已删除 · {diff.file.path}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: C.appBg, overflow: 'hidden', minWidth: 0 }}>
      <DiffFileHeader diff={diff} viewMode={viewMode} setViewMode={setViewMode} />
      <div style={{ flex: 1, overflowY: 'auto', fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {diff.diffLines.map((line, index) => {
              if (line.type === 'hunk') {
                return (
                  <tr key={index}>
                    <td style={{ width: 36, background: C.panel2, color: C.textWeak, fontSize: 10, padding: '4px 8px', userSelect: 'none', textAlign: 'right', borderRight: `1px solid ${C.border}` }}>…</td>
                    <td style={{ width: 36, background: C.panel2, color: C.textWeak, fontSize: 10, padding: '4px 8px', userSelect: 'none', textAlign: 'right', borderRight: `1px solid ${C.border}` }}>…</td>
                    <td style={{ background: `${C.needPull}10`, color: C.needPull, padding: '4px 12px', fontSize: 11 }}>{line.content}</td>
                  </tr>
                );
              }

              const lineNum = index + 1;
              const isAdded = line.type === 'added';
              const isDeleted = line.type === 'deleted';

              return (
                <tr key={index} style={{ background: isAdded ? `${C.added}12` : isDeleted ? `${C.deleted}10` : 'transparent' }}>
                  <td
                    style={{
                      width: 36,
                      background: isAdded ? `${C.added}18` : isDeleted ? `${C.deleted}18` : C.panel1,
                      color: isAdded ? C.added : isDeleted ? C.deleted : C.textWeak,
                      padding: '2px 8px',
                      userSelect: 'none',
                      textAlign: 'right',
                      borderRight: `1px solid ${C.border}`,
                      fontSize: 11,
                    }}
                  >
                    {isAdded ? '' : lineNum}
                  </td>
                  <td
                    style={{
                      width: 36,
                      background: isAdded ? `${C.added}18` : isDeleted ? `${C.deleted}18` : C.panel1,
                      color: isAdded ? C.added : isDeleted ? C.deleted : C.textWeak,
                      padding: '2px 8px',
                      userSelect: 'none',
                      textAlign: 'right',
                      borderRight: `1px solid ${C.border}`,
                      fontSize: 11,
                    }}
                  >
                    {isAdded ? lineNum : ''}
                  </td>
                  <td style={{ padding: '2px 12px', color: isAdded ? C.added : isDeleted ? C.deleted : C.textSecondary, whiteSpace: 'pre' }}>
                    {line.content || ' '}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
