import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import { C } from '../theme';
import type { FileChange, FileDiff, FileStatus } from '../domain/types';
import { FileDiffPanel } from './file-diff';

interface DiffListProps {
  files: FileChange[];
  revision: string;
  onLoadDiff: (file: FileChange) => Promise<FileDiff>;
}

function StatusTag({ status }: { status: FileStatus }) {
  const cfg: Record<FileStatus, { color: string; bg: string }> = {
    A: { color: C.added, bg: `${C.added}20` },
    M: { color: C.modified, bg: `${C.modified}18` },
    D: { color: C.deleted, bg: `${C.deleted}18` },
    R: { color: C.needPull, bg: `${C.needPull}18` },
  };
  const style = cfg[status];
  return (
    <span style={{ color: style.color, background: style.bg, fontSize: 10, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', padding: '1px 5px', borderRadius: 3, width: 20, textAlign: 'center', display: 'inline-block', flexShrink: 0 }}>
      {status}
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

interface FileRowProps {
  file: FileChange;
  expanded: boolean;
  revision: string;
  onToggle: () => void;
  onLoadDiff: (file: FileChange) => Promise<FileDiff>;
}

function FileRow({ file, expanded, revision, onToggle, onLoadDiff }: FileRowProps) {
  const [hovered, setHovered] = useState(false);
  const pathParts = file.path.split('/');
  const fileName = pathParts.pop() ?? '';
  const dirPath = pathParts.join('/');
  const rowBackground = expanded ? C.panel2 : hovered ? C.hoverBg : 'transparent';

  return (
    <div>
      <button
        type="button"
        title={expanded ? '收起代码差异' : '展开代码差异'}
        aria-expanded={expanded}
        onClick={onToggle}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: rowBackground, border: 'none', cursor: 'pointer', borderRadius: 4, borderLeft: expanded ? `2px solid ${C.btnPrimary}` : '2px solid transparent', transition: 'background 0.08s', textAlign: 'left' }}
      >
        {expanded ? <ChevronDown size={13} color={C.btnPrimary} /> : <ChevronRight size={13} color={C.textWeak} />}
        <StatusTag status={file.status} />
        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: file.status === 'D' ? C.deleted : C.textSecondary, textDecoration: file.status === 'D' ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center' }}>
            {dirPath && <span style={{ color: C.textWeak }}>{dirPath}/</span>}
            <span style={{ color: file.status === 'D' ? C.deleted : C.textPrimary }}>{fileName}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          {file.additions > 0 && <span style={{ color: C.added, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}>+{file.additions}</span>}
          {file.deletions > 0 && <span style={{ color: C.deleted, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}>-{file.deletions}</span>}
          <span style={{ color: C.textWeak, fontSize: 10, minWidth: 44, textAlign: 'right' }}>{file.size}</span>
        </div>
      </button>
      {expanded && <FileDiffPanel key={`${file.id}:${revision}`} file={file} loadDiff={onLoadDiff} />}
    </div>
  );
}

interface ChangeSectionProps extends DiffListProps {
  title: string;
  expandedId: string | null;
  onToggle: (id: string) => void;
}

function ChangeSection({ title, files, revision, expandedId, onToggle, onLoadDiff }: ChangeSectionProps) {
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
          <FileRow key={file.id} file={file} expanded={expandedId === file.id} revision={revision} onToggle={() => onToggle(file.id)} onLoadDiff={onLoadDiff} />
        ))}
      </div>
    </>
  );
}

export function DiffList({ files, revision, onLoadDiff }: DiffListProps) {
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const filtered = useMemo(
    () => files.filter(file => !search || file.path.toLowerCase().includes(search.toLowerCase())),
    [files, search],
  );
  const stagedFiles = filtered.filter(file => file.staged);
  const unstagedFiles = filtered.filter(file => !file.staged);
  const handleToggle = (id: string) => setExpandedId(current => current === id ? null : id);

  return (
    <div style={{ flex: 1, minWidth: 0, background: C.panel1, borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', position: 'relative', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '10px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div style={{ position: 'relative' }}>
          <Search size={11} color={C.textWeak} style={{ position: 'absolute', left: 7, top: '50%', transform: 'translateY(-50%)' }} />
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索路径" style={{ width: '100%', background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 8px 6px 22px', color: C.textSecondary, fontSize: 11, outline: 'none', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box' }} />
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        <ChangeSection title="暂存的更改" files={stagedFiles} revision={revision} expandedId={expandedId} onToggle={handleToggle} onLoadDiff={onLoadDiff} />
        <ChangeSection title="更改" files={unstagedFiles} revision={revision} expandedId={expandedId} onToggle={handleToggle} onLoadDiff={onLoadDiff} />
        {filtered.length === 0 && <div style={{ padding: 30, textAlign: 'center', color: C.textWeak, fontSize: 12 }}>没有匹配的文件</div>}
      </div>
    </div>
  );
}
