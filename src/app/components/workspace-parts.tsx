import type { CSSProperties, ReactNode } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, FolderOpen, GitBranch, Settings2, Terminal } from 'lucide-react';
import { C } from '../theme';
import type { FileChange, Repo } from '../types';

function HeaderActionBtn({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: C.panel2,
        border: `1px solid ${C.border}`,
        color: C.textSecondary,
        borderRadius: 6,
        padding: label ? '5px 10px' : '5px 8px',
        cursor: 'pointer',
        fontSize: 11,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
      }}
    >
      {icon}
      {label}
    </button>
  );
}

export function RepoHeader({
  repo,
  fileSummary,
  onOpenFolder,
  onOpenTerminal,
  onOpenSettings,
}: {
  repo: Repo;
  fileSummary: ReturnType<typeof summarizeFiles>;
  onOpenFolder: () => void;
  onOpenTerminal: () => void;
  onOpenSettings: () => void;
}) {
  return (
    <div style={{ background: C.panel1, borderBottom: `1px solid ${C.border}`, padding: '10px 16px', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ color: C.textPrimary, fontSize: 15, fontWeight: 600 }}>{repo.name}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 5, padding: '2px 8px' }}>
              <GitBranch size={11} color={C.btnPrimary} />
              <span style={{ color: C.btnPrimary, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}>{repo.branch}</span>
            </div>
            <span style={{ color: C.textWeak, fontSize: 10 }}>→</span>
            <span style={{ color: C.textWeak, fontSize: 11 }}>{repo.remote}</span>
            {repo.ahead > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: C.needPush, fontSize: 11 }}><ArrowUp size={11} /> {repo.ahead} 待 Push</span>}
            {repo.behind > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: C.needPull, fontSize: 11 }}><ArrowDown size={11} /> {repo.behind} 待 Pull</span>}
            {repo.scanError && <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: C.conflict, fontSize: 11 }}><AlertTriangle size={11} /> 扫描失败</span>}
            {repo.conflicts > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: C.conflict, fontSize: 11 }}><AlertTriangle size={11} /> {repo.conflicts} 个冲突</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
            <span style={{ color: C.textWeak, fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}>{repo.path}</span>
            {fileSummary.total > 0 && <span style={{ color: C.textSecondary, fontSize: 10 }}>{fileSummary.total} 处变更 ·<span style={{ color: C.added }}> +{fileSummary.added} 新增</span> ·<span style={{ color: C.modified }}> ~{fileSummary.modified} 修改</span> ·<span style={{ color: C.deleted }}> -{fileSummary.deleted} 删除</span></span>}
            <span style={{ color: C.textWeak, fontSize: 10 }}>更新于 {repo.lastScan}</span>
            {repo.scanError && <span style={{ color: C.conflict, fontSize: 10 }}>{repo.scanError}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
          <HeaderActionBtn icon={<FolderOpen size={11} />} label="文件夹" onClick={onOpenFolder} />
          <HeaderActionBtn icon={<Terminal size={11} />} label="外部终端" onClick={onOpenTerminal} />
          <HeaderActionBtn icon={<Settings2 size={13} />} onClick={onOpenSettings} />
        </div>
      </div>
    </div>
  );
}

export function ConflictBanner({
  repo,
  onOpenConflicts,
  onViewLog,
}: {
  repo: Repo;
  onOpenConflicts: () => void;
  onViewLog: () => void;
}) {
  return (
    <div style={{ background: `${C.conflict}12`, border: `1px solid ${C.conflict}40`, borderRadius: 8, padding: '10px 14px', margin: '12px 14px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <AlertTriangle size={14} color={C.conflict} style={{ marginTop: 1, flexShrink: 0 }} />
      <div>
        <div style={{ color: C.conflict, fontSize: 12, fontWeight: 600, marginBottom: 2 }}>检测到合并冲突</div>
        <div style={{ color: C.textSecondary, fontSize: 11, lineHeight: 1.5 }}>{repo.conflicts} 个文件存在冲突，合并前必须先解决。</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button onClick={onOpenConflicts} style={{ background: C.conflict, color: 'white', border: 'none', borderRadius: 5, padding: '4px 12px', cursor: 'pointer', fontSize: 11, fontWeight: 500 }}>打开冲突处理器</button>
          <button onClick={onViewLog} style={{ background: 'none', border: `1px solid ${C.conflict}50`, color: C.conflict, borderRadius: 5, padding: '4px 10px', cursor: 'pointer', fontSize: 11 }}>查看日志</button>
        </div>
      </div>
    </div>
  );
}

export function ToolbarBtn({
  label,
  icon,
  onClick,
  disabled,
  primary,
  accent,
  warning,
  dimmed,
  style,
}: {
  label: string;
  icon: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  primary?: boolean;
  accent?: boolean;
  warning?: boolean;
  dimmed?: boolean;
  style?: CSSProperties;
}) {
  const bg = disabled ? C.panel3 : primary ? C.btnPrimary : accent ? `${C.aiAccent}22` : 'transparent';
  const borderColor = disabled ? C.border : primary ? C.btnPrimary : accent ? `${C.aiAccent}60` : warning ? `${C.modified}60` : C.border;
  const textColor = disabled ? C.textWeak : primary ? 'white' : accent ? C.aiAccent : warning ? C.modified : dimmed ? C.textWeak : C.textSecondary;

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{ background: bg, border: `1px solid ${borderColor}`, color: textColor, borderRadius: 6, padding: '5px 10px', cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5, opacity: disabled ? 0.72 : dimmed ? 0.6 : 1, fontWeight: primary ? 500 : 400, ...style }}
    >
      {icon} {label}
    </button>
  );
}

export function summarizeFiles(files: FileChange[]) {
  const uniqueByPath = new Map<string, FileChange['status']>();
  for (const file of files) {
    if (!uniqueByPath.has(file.path)) uniqueByPath.set(file.path, file.status);
  }
  const statuses = [...uniqueByPath.values()];
  return {
    total: uniqueByPath.size,
    added: statuses.filter(status => status === 'A').length,
    modified: statuses.filter(status => status === 'M' || status === 'R').length,
    deleted: statuses.filter(status => status === 'D').length,
  };
}
