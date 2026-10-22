import type { CSSProperties, ReactNode } from 'react';
import { Activity, AlertTriangle, ArrowDown, ArrowUp, FolderOpen, GitBranch, GitCompare, ListTodo, Settings2, Terminal } from 'lucide-react';
import { C } from '../theme';
import type { WorktreeGroup } from '../domain/worktree-groups';
import type { FileChange, Repo } from '../domain/types';

function HeaderActionBtn({
  icon,
  label,
  ariaLabel,
  onClick,
  compact = false,
  badge = 0,
}: {
  icon: ReactNode;
  label?: string;
  ariaLabel?: string;
  onClick: () => void;
  compact?: boolean;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      title={badge > 0 ? `${label} · ${badge}` : label ?? ariaLabel}
      aria-label={badge > 0 ? `${label} · ${badge}` : label ?? ariaLabel}
      className={compact ? 'background-task-entry' : undefined}
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
      {label && <span>{label}</span>}
      {badge > 0 && <span className="background-task-count">· {badge}</span>}
    </button>
  );
}

const worktreeBadgeStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  background: C.panel2,
  border: `1px solid ${C.border}`,
  borderRadius: 5,
  padding: '2px 8px',
  color: C.textSecondary,
  fontSize: 11,
} as const;

export function RepoHeader({
  repo,
  worktreeGroup,
  fileSummary,
  onOpenFolder,
  onOpenMonitor,
  onOpenBackgroundTasks,
  backgroundTaskCount = 0,
  onOpenTerminal,
  onOpenDiffViewer,
  onOpenSettings,
}: {
  repo: Repo;
  worktreeGroup?: WorktreeGroup | null;
  fileSummary: ReturnType<typeof summarizeFiles>;
  onOpenFolder: () => void;
  onOpenMonitor: () => void;
  onOpenBackgroundTasks: () => void;
  backgroundTaskCount?: number;
  onOpenTerminal: () => void;
  onOpenDiffViewer: () => void;
  onOpenSettings: () => void;
}) {
  const multiWorktree = (worktreeGroup?.repos.length ?? 0) > 1;
  const showWorktreeContext = multiWorktree || repo.isMainWorktree === false;
  const title = showWorktreeContext && worktreeGroup ? worktreeGroup.name : repo.name;
  return (
    <div style={{ background: C.panel1, borderBottom: `1px solid ${C.border}`, padding: '10px 16px', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ color: C.textPrimary, fontSize: 15, fontWeight: 600 }}>{title}</span>
            {showWorktreeContext && (
              <span style={worktreeBadgeStyle} title={`工作树：${repo.name}\n${repo.path}`}>
                {multiWorktree && repo.isMainWorktree ? '主工作树' : `工作树 · ${repo.name}`}
              </span>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 5, padding: '2px 8px' }}>
              <GitBranch size={11} color={C.btnPrimary} />
              <span style={{ color: C.btnPrimary, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}>{repo.branch}</span>
            </div>
            <span style={{ color: C.textWeak, fontSize: 10 }}>→</span>
            <span style={{ color: C.textWeak, fontSize: 11 }}>{repo.remote}</span>
            {repo.ahead > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: C.needPush, fontSize: 11 }}><ArrowUp size={11} /> {repo.ahead} 待 Push</span>}
            {repo.behind > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: C.needPull, fontSize: 11 }}><ArrowDown size={11} /> {repo.behind} 待 Pull</span>}
            {repo.scanError && <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: C.conflict, fontSize: 11 }}><AlertTriangle size={11} /> 本地扫描失败</span>}
            {repo.remoteCheck?.status === 'error' && <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: C.conflict, fontSize: 11 }}><AlertTriangle size={11} /> 远端检查失败</span>}
            {repo.conflicts > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: C.conflict, fontSize: 11 }}><AlertTriangle size={11} /> {repo.conflicts} 个冲突</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
            <span style={{ color: C.textWeak, fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}>{repo.path}</span>
            {multiWorktree && worktreeGroup && <span style={{ color: C.textWeak, fontSize: 10 }}>{worktreeGroup.repos.length} 个工作树</span>}
            {fileSummary.total > 0 && <span style={{ color: C.textSecondary, fontSize: 10 }}>{fileSummary.total} 处变更 ·<span style={{ color: C.added }}> +{fileSummary.added} 新增</span> ·<span style={{ color: C.modified }}> ~{fileSummary.modified} 修改</span> ·<span style={{ color: C.deleted }}> -{fileSummary.deleted} 删除</span></span>}
            <span style={{ color: C.textWeak, fontSize: 10 }}>本地更新于 {repo.lastScan}</span>
            {repo.remote !== '—' && <span style={{ color: repo.remoteCheck?.status === 'error' ? C.conflict : C.textWeak, fontSize: 10 }}>{repo.remoteCheck ? `${repo.remoteCheck.status === 'success' ? '远端检查成功' : '远端检查失败'}于 ${repo.remoteCheck.checkedAt}` : '远端尚未检查'}</span>}
            {repo.scanError && <span style={{ color: C.conflict, fontSize: 10 }}>{repo.scanError}</span>}
            {repo.remoteCheck?.error && <span style={{ color: C.conflict, fontSize: 10 }}>{repo.remoteCheck.error}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
          <div role="group" aria-label="资源监控" style={{ display: 'flex', alignItems: 'center' }}>
            <HeaderActionBtn icon={<Activity size={11} />} label="资源监控" onClick={onOpenMonitor} />
          </div>
          <span role="separator" aria-orientation="vertical" style={{ width: 1, height: 18, flexShrink: 0, background: C.borderLight }} />
          <div role="group" aria-label="项目工具" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <HeaderActionBtn icon={<FolderOpen size={11} />} label="文件夹" onClick={onOpenFolder} />
            <HeaderActionBtn icon={<ListTodo size={11} />} label="后台任务" badge={backgroundTaskCount} compact onClick={onOpenBackgroundTasks} />
            <HeaderActionBtn icon={<Terminal size={11} />} label="外部终端" onClick={onOpenTerminal} />
            <HeaderActionBtn icon={<GitCompare size={11} />} label="查看差异" onClick={onOpenDiffViewer} />
          </div>
          <span role="separator" aria-orientation="vertical" style={{ width: 1, height: 18, flexShrink: 0, background: C.borderLight }} />
          <div role="group" aria-label="设置" style={{ display: 'flex', alignItems: 'center' }}>
            <HeaderActionBtn icon={<Settings2 size={13} />} ariaLabel="设置" onClick={onOpenSettings} />
          </div>
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
  icon?: ReactNode;
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
      {icon && icon}{label}
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
