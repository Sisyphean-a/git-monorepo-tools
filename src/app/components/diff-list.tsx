import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { C } from '../theme';
import type { FileChange, FileStatus } from '../types';

interface DiffListProps {
  files: FileChange[];
  stagedIds: Set<string>;
  onToggleStaged: (id: string) => void;
}

function StatusTag({ status }: { status: FileStatus }) {
  const cfg: Record<FileStatus, { color: string; bg: string; label: string }> = {
    A: { color: C.added, bg: `${C.added}20`, label: 'A' },
    M: { color: C.modified, bg: `${C.modified}18`, label: 'M' },
    D: { color: C.deleted, bg: `${C.deleted}18`, label: 'D' },
    R: { color: C.needPull, bg: `${C.needPull}18`, label: 'R' },
  };
  const c = cfg[status];

  return (
    <span
      style={{
        color: c.color,
        background: c.bg,
        fontSize: 10,
        fontWeight: 700,
        fontFamily: 'JetBrains Mono, monospace',
        padding: '1px 5px',
        borderRadius: 3,
        width: 20,
        textAlign: 'center',
        display: 'inline-block',
        flexShrink: 0,
      }}
    >
      {c.label}
    </span>
  );
}

function summarizeSection(files: FileChange[]) {
  return files.reduce((summary, file) => ({
    count: summary.count + 1,
    additions: summary.additions + file.additions,
    deletions: summary.deletions + file.deletions,
  }), { count: 0, additions: 0, deletions: 0 });
}

function FileRow({
  file,
  isStaged,
  onToggleStage,
}: {
  file: FileChange;
  isStaged: boolean;
  onToggleStage: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const pathParts = file.path.split('/');
  const fileName = pathParts.pop() ?? '';
  const dirPath = pathParts.join('/');

  return (
    <button
      type="button"
      title={isStaged ? '点击取消暂存' : '点击暂存'}
      onClick={onToggleStage}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 10px',
        background: hovered ? C.hoverBg : 'transparent',
        border: 'none',
        cursor: 'pointer',
        borderRadius: 4,
        borderLeft: isStaged ? `2px solid ${C.btnPrimary}40` : '2px solid transparent',
        transition: 'background 0.08s',
        textAlign: 'left',
      }}
    >
      <StatusTag status={file.status} />
      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
        <div
          style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 12,
            color: file.status === 'D' ? C.deleted : C.textSecondary,
            textDecoration: file.status === 'D' ? 'line-through' : 'none',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          {dirPath && <span style={{ color: C.textWeak }}>{dirPath}/</span>}
          <span style={{ color: file.status === 'D' ? C.deleted : C.textPrimary }}>{fileName}</span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
        {file.additions > 0 && <span style={{ color: C.added, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}>+{file.additions}</span>}
        {file.deletions > 0 && <span style={{ color: C.deleted, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}>-{file.deletions}</span>}
        <span style={{ color: C.textWeak, fontSize: 10, minWidth: 44, textAlign: 'right' }}>{file.size}</span>
        {hovered && <span style={{ color: C.btnPrimary, fontSize: 10 }}>{isStaged ? '取消暂存' : '暂存'}</span>}
      </div>
    </button>
  );
}

function ChangeSection({
  title,
  files,
  stagedIds,
  onToggleStaged,
}: {
  title: string;
  files: FileChange[];
  stagedIds: Set<string>;
  onToggleStaged: (id: string) => void;
}) {
  if (files.length === 0) return null;
  const summary = summarizeSection(files);

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px 6px', borderBottom: `1px solid ${C.border}` }}>
        <span style={{ color: C.textSecondary, fontSize: 11, fontWeight: 600 }}>{title}</span>
        <span style={{ color: C.textWeak, fontSize: 11 }}>{summary.count}</span>
        <span style={{ color: C.added, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}>+{summary.additions}</span>
        <span style={{ color: C.deleted, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}>-{summary.deletions}</span>
      </div>
      <div style={{ padding: '4px 0 8px' }}>
        {files.map(file => (
          <FileRow
            key={file.id}
            file={file}
            isStaged={stagedIds.has(file.id)}
            onToggleStage={() => onToggleStaged(file.id)}
          />
        ))}
      </div>
    </>
  );
}

export function DiffList({ files, stagedIds, onToggleStaged }: DiffListProps) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(
    () => files.filter(file => !search || file.path.toLowerCase().includes(search.toLowerCase())),
    [files, search],
  );

  const stagedFiles = filtered.filter(file => stagedIds.has(file.id));
  const unstagedFiles = filtered.filter(file => !stagedIds.has(file.id));

  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        background: C.panel1,
        borderRight: `1px solid ${C.border}`,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '10px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div style={{ position: 'relative' }}>
          <Search size={11} color={C.textWeak} style={{ position: 'absolute', left: 7, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="搜索路径"
            style={{
              width: '100%',
              background: C.panel2,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              padding: '6px 8px 6px 22px',
              color: C.textSecondary,
              fontSize: 11,
              outline: 'none',
              fontFamily: 'Inter, sans-serif',
              boxSizing: 'border-box',
            }}
          />
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        <ChangeSection title="暂存的更改" files={stagedFiles} stagedIds={stagedIds} onToggleStaged={onToggleStaged} />
        <ChangeSection title="更改" files={unstagedFiles} stagedIds={stagedIds} onToggleStaged={onToggleStaged} />

        {filtered.length === 0 && (
          <div style={{ padding: 30, textAlign: 'center', color: C.textWeak, fontSize: 12 }}>
            没有匹配的文件
          </div>
        )}
      </div>
    </div>
  );
}
