import { useState } from 'react';
import { CheckSquare, Minus, Plus, Search, Square } from 'lucide-react';
import { C } from '../theme';
import type { FileChange, FileStatus } from '../types';

type FilterType = 'all' | 'unstaged' | 'staged' | 'added' | 'modified' | 'deleted';

interface DiffListProps {
  files: FileChange[];
  stagedIds: Set<string>;
  onToggleStaged: (id: string) => void;
  onStageAll: () => void;
  onUnstageAll: () => void;
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
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '7px 10px',
        background: hovered ? C.hoverBg : 'transparent',
        cursor: 'default',
        borderRadius: 4,
        borderLeft: isStaged ? `2px solid ${C.btnPrimary}40` : '2px solid transparent',
        transition: 'background 0.08s',
      }}
    >
      <button
        onClick={e => {
          e.stopPropagation();
          onToggleStage();
        }}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0, display: 'flex', color: C.textWeak }}
      >
        {isStaged ? <CheckSquare size={13} color={C.btnPrimary} /> : <Square size={13} color={C.textWeak} />}
      </button>
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
      </div>
    </div>
  );
}

export function DiffList({ files, stagedIds, onToggleStaged, onStageAll, onUnstageAll }: DiffListProps) {
  const [filter, setFilter] = useState<FilterType>('all');
  const [search, setSearch] = useState('');

  const allFiles = files;
  const totalAdded = allFiles.filter(file => file.status === 'A').length;
  const totalModified = allFiles.filter(file => file.status === 'M').length;
  const totalDeleted = allFiles.filter(file => file.status === 'D').length;
  const totalStaged = stagedIds.size;
  const totalUnstaged = allFiles.length - totalStaged;

  const chips: { key: FilterType; label: string; count: number }[] = [
    { key: 'all', label: '全部', count: allFiles.length },
    { key: 'unstaged', label: '未暂存', count: totalUnstaged },
    { key: 'staged', label: '已暂存', count: totalStaged },
    { key: 'added', label: '新增', count: totalAdded },
    { key: 'modified', label: '修改', count: totalModified },
    { key: 'deleted', label: '删除', count: totalDeleted },
  ];

  const filtered = allFiles.filter(file => {
    const matchSearch = !search || file.path.toLowerCase().includes(search.toLowerCase());
    const matchFilter =
      filter === 'all' ? true :
      filter === 'staged' ? stagedIds.has(file.id) :
      filter === 'unstaged' ? !stagedIds.has(file.id) :
      filter === 'added' ? file.status === 'A' :
      filter === 'modified' ? file.status === 'M' :
      filter === 'deleted' ? file.status === 'D' : true;
    return matchSearch && matchFilter;
  });

  const stagedFiles = filtered.filter(file => stagedIds.has(file.id));
  const unstagedFiles = filtered.filter(file => !stagedIds.has(file.id));

  const SectionHeader = ({
    title,
    count,
    totalAdd,
    totalDel,
    onStage,
    onUnstage,
    isStaged,
  }: {
    title: string;
    count: number;
    totalAdd: number;
    totalDel: number;
    onStage?: () => void;
    onUnstage?: () => void;
    isStaged?: boolean;
  }) => (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '6px 10px 4px',
        borderBottom: `1px solid ${C.border}`,
      }}
    >
      <span style={{ color: C.textSecondary, fontSize: 11, fontWeight: 600, flex: 1 }}>
        {title}{' '}
        <span style={{ color: C.textWeak }}>
          ({count} 个文件 · <span style={{ color: C.added }}>+{totalAdd}</span> <span style={{ color: C.deleted }}>-{totalDel}</span>)
        </span>
      </span>
      {isStaged ? (
        <button onClick={onUnstage} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textWeak, fontSize: 10, padding: '2px 4px' }}>
          全部取消暂存
        </button>
      ) : (
        <button onClick={onStage} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textWeak, fontSize: 10, padding: '2px 4px' }}>
          全部暂存
        </button>
      )}
    </div>
  );

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
      <div style={{ padding: '10px 10px 0', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ color: C.textPrimary, fontSize: 12, fontWeight: 600 }}>
            差异列表 <span style={{ color: C.textWeak }}>{allFiles.length} / {allFiles.length}</span>
          </span>
          <div style={{ flex: 1 }} />
          <div style={{ position: 'relative' }}>
            <Search size={11} color={C.textWeak} style={{ position: 'absolute', left: 7, top: '50%', transform: 'translateY(-50%)' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="搜索路径或类型"
              style={{
                background: C.panel2,
                border: `1px solid ${C.border}`,
                borderRadius: 5,
                padding: '4px 8px 4px 22px',
                color: C.textSecondary,
                fontSize: 11,
                outline: 'none',
                width: 140,
                fontFamily: 'Inter, sans-serif',
              }}
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, paddingBottom: 8, flexWrap: 'wrap' }}>
          {chips.map(chip => (
            <button
              key={chip.key}
              onClick={() => setFilter(chip.key)}
              style={{
                background: filter === chip.key ? `${C.btnPrimary}22` : C.panel2,
                border: `1px solid ${filter === chip.key ? C.btnPrimary : C.border}`,
                color: filter === chip.key ? C.btnPrimary : C.textWeak,
                borderRadius: 4,
                padding: '3px 8px',
                cursor: 'pointer',
                fontSize: 11,
                transition: 'all 0.1s',
              }}
            >
              {chip.label} <span style={{ opacity: 0.7 }}>{chip.count}</span>
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {(filter === 'all' || filter === 'staged') && stagedFiles.length > 0 && (
          <>
            <SectionHeader
              title="已暂存变更"
              count={stagedFiles.length}
              totalAdd={stagedFiles.reduce((sum, file) => sum + file.additions, 0)}
              totalDel={stagedFiles.reduce((sum, file) => sum + file.deletions, 0)}
              isStaged
              onUnstage={onUnstageAll}
            />
            <div style={{ padding: '2px 0' }}>
              {stagedFiles.map(file => (
                <FileRow
                  key={file.id}
                  file={file}
                  isStaged
                  onToggleStage={() => onToggleStaged(file.id)}
                />
              ))}
            </div>
          </>
        )}

        {(filter === 'all' || filter === 'unstaged') && unstagedFiles.length > 0 && (
          <>
            <SectionHeader
              title="未暂存变更"
              count={unstagedFiles.length}
              totalAdd={unstagedFiles.reduce((sum, file) => sum + file.additions, 0)}
              totalDel={unstagedFiles.reduce((sum, file) => sum + file.deletions, 0)}
              onStage={onStageAll}
              isStaged={false}
            />
            <div style={{ padding: '2px 0' }}>
              {unstagedFiles.map(file => (
                <FileRow
                  key={file.id}
                  file={file}
                  isStaged={false}
                  onToggleStage={() => onToggleStaged(file.id)}
                />
              ))}
            </div>
          </>
        )}

        {filter !== 'all' && filter !== 'staged' && filter !== 'unstaged' && filtered.map(file => (
          <FileRow
            key={file.id}
            file={file}
            isStaged={stagedIds.has(file.id)}
            onToggleStage={() => onToggleStaged(file.id)}
          />
        ))}

        {filtered.length === 0 && (
          <div style={{ padding: 30, textAlign: 'center', color: C.textWeak, fontSize: 12 }}>
            没有匹配当前筛选的文件
          </div>
        )}
      </div>

      {stagedIds.size === 0 && filter === 'staged' && (
        <div
          style={{
            position: 'absolute',
            bottom: 80,
            left: 10,
            right: 10,
            background: C.panel2,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            padding: 16,
            textAlign: 'center',
          }}
        >
          <div style={{ color: C.textSecondary, fontSize: 12, marginBottom: 4 }}>还没有暂存内容</div>
          <div style={{ color: C.textWeak, fontSize: 11 }}>
            选择文件或点击“全部暂存”后，AI 才能根据暂存区生成提交信息。
          </div>
        </div>
      )}
    </div>
  );
}
