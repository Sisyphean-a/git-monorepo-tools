import { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  AlertTriangle,
  Clock,
  Download,
  FolderOpen,
  GitBranch,
  GitCommit,
  PlusSquare,
  MinusSquare,
  RefreshCw,
  Settings2,
  Sparkles,
  Terminal,
  Upload,
  ChevronRight,
} from 'lucide-react';
import { fetchRepoDiff, fetchRepoLog, generateCommitCandidates, invokeLocalRepoAction, mutateRepo } from '../api';
import { C } from '../theme';
import { AiCommitPanel } from './ai-commit-panel';
import { DiffList } from './diff-list';
import { DiffPreview } from './diff-preview';
import type { AppSettings, CommitCandidate, CommitSummary, FileChange, Repo, RepoDetail, RepoDiff, RepoLog } from '../types';

type MainTab = 'changes' | 'staged' | 'history' | 'activity';

interface WorkspaceProps {
  repoDetails: Record<string, RepoDetail>;
  commitCandidates: Record<string, CommitCandidate[]>;
  settings: AppSettings;
  selectedRepoId: string;
  onRefresh: () => void;
  onOpenSettings: () => void;
  onShowLog: (log: RepoLog) => void;
}

function ConflictBanner({
  repo,
  onOpenConflicts,
  onViewLog,
}: {
  repo: Repo;
  onOpenConflicts: () => void;
  onViewLog: () => void;
}) {
  return (
    <div
      style={{
        background: `${C.conflict}12`,
        border: `1px solid ${C.conflict}40`,
        borderRadius: 8,
        padding: '10px 14px',
        margin: '12px 14px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
      }}
    >
      <AlertTriangle size={14} color={C.conflict} style={{ marginTop: 1, flexShrink: 0 }} />
      <div>
        <div style={{ color: C.conflict, fontSize: 12, fontWeight: 600, marginBottom: 2 }}>检测到合并冲突</div>
        <div style={{ color: C.textSecondary, fontSize: 11, lineHeight: 1.5 }}>
          {repo.conflicts} 个文件存在冲突，合并前必须先解决。
          为避免数据丢失，已跳过 Pull。请先手动解决冲突，再执行暂存和提交。
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button onClick={onOpenConflicts} style={{ background: C.conflict, color: 'white', border: 'none', borderRadius: 5, padding: '4px 12px', cursor: 'pointer', fontSize: 11, fontWeight: 500 }}>
            打开冲突处理器
          </button>
          <button onClick={onViewLog} style={{ background: 'none', border: `1px solid ${C.conflict}50`, color: C.conflict, borderRadius: 5, padding: '4px 10px', cursor: 'pointer', fontSize: 11 }}>
            查看日志
          </button>
        </div>
      </div>
    </div>
  );
}

function HistoryTab({ commits }: { commits: CommitSummary[] }) {
  if (commits.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textWeak, fontSize: 12 }}>
        暂无提交历史
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      {commits.map(commit => (
        <div
          key={commit.hash}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 14px',
            borderBottom: `1px solid ${C.border}30`,
            cursor: 'pointer',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLDivElement).style.background = C.hoverBg;
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLDivElement).style.background = 'transparent';
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background: C.panel2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <GitCommit size={12} color={C.textWeak} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: C.textPrimary, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {commit.message}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 2, alignItems: 'center' }}>
              <span style={{ color: C.textWeak, fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}>{commit.shortHash}</span>
              <span style={{ color: C.textWeak, fontSize: 10 }}>·</span>
              <span style={{ color: C.textWeak, fontSize: 10 }}>{commit.author}</span>
              <span style={{ color: C.textWeak, fontSize: 10 }}>·</span>
              <Clock size={9} color={C.textWeak} />
              <span style={{ color: C.textWeak, fontSize: 10 }}>{commit.time}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <span style={{ color: C.added, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}>+{commit.additions}</span>
            <span style={{ color: C.deleted, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}>-{commit.deletions}</span>
          </div>
          <ChevronRight size={12} color={C.textWeak} />
        </div>
      ))}
    </div>
  );
}

function ToolbarBtn({
  label,
  icon,
  onClick,
  disabled,
  primary,
  accent,
  warning,
  dimmed,
}: {
  label: string;
  icon: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  primary?: boolean;
  accent?: boolean;
  warning?: boolean;
  dimmed?: boolean;
}) {
  const bg = primary ? C.btnPrimary : accent ? `${C.aiAccent}22` : 'transparent';
  const borderColor = primary ? C.btnPrimary : accent ? `${C.aiAccent}60` : warning ? `${C.modified}60` : C.border;
  const textColor = primary ? 'white' : accent ? C.aiAccent : warning ? C.modified : dimmed ? C.textWeak : C.textSecondary;

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: bg,
        border: `1px solid ${disabled ? C.border : borderColor}`,
        color: disabled ? C.textWeak : textColor,
        borderRadius: 6,
        padding: '5px 10px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 12,
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        opacity: disabled ? 0.45 : dimmed ? 0.6 : 1,
        transition: 'all 0.1s',
        fontWeight: primary ? 500 : 400,
      }}
    >
      {icon} {label}
    </button>
  );
}

function summarizeFiles(files: FileChange[]) {
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

export function Workspace({
  repoDetails,
  commitCandidates,
  settings,
  selectedRepoId,
  onRefresh,
  onOpenSettings,
  onShowLog,
}: WorkspaceProps) {
  const repoIds = Object.keys(repoDetails);
  const repo = repoDetails[selectedRepoId] ?? (repoIds[0] ? repoDetails[repoIds[0]] : undefined);
  const [mainTab, setMainTab] = useState<MainTab>('changes');
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [commitMessage, setCommitMessage] = useState('');
  const [stagedIds, setStagedIds] = useState<Set<string>>(new Set());
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [diff, setDiff] = useState<RepoDiff | null>(null);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [aiCandidates, setAiCandidates] = useState<CommitCandidate[]>([]);
  const [aiError, setAiError] = useState<string | null>(null);

  useEffect(() => {
    const nextFiles = repo?.files ?? [];
    setSelectedFileId(current => {
      const currentPath = current?.split('::')[0];
      const matched = currentPath ? nextFiles.find(file => file.path === currentPath) : undefined;
      return matched?.id ?? nextFiles[0]?.id ?? null;
    });
    setStagedIds(new Set(nextFiles.filter(file => file.staged).map(file => file.id)));
    setCommitMessage('');
    setAiCandidates([]);
    setAiError(null);
  }, [repo?.id, repo?.scannedAt]);

  useEffect(() => {
    if (!repo || !selectedFileId) {
      setDiff(null);
      return;
    }
    const selectedFile = repo.files.find(file => file.id === selectedFileId);
    if (!selectedFile) {
      setDiff(null);
      return;
    }
    setLoadingDiff(true);
    void fetchRepoDiff(repo.id, settings, {
      fileId: selectedFile.id,
      filePath: selectedFile.path,
      staged: stagedIds.has(selectedFile.id),
    }).then(setDiff).finally(() => setLoadingDiff(false));
  }, [repo?.id, repo?.scannedAt, selectedFileId, stagedIds, settings]);

  if (!repo) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textWeak, fontSize: 12 }}>
        未发现可展示的仓库
      </div>
    );
  }

  const files = repo.files;
  const fileSummary = summarizeFiles(files);
  const stagedFiles = files.filter(file => stagedIds.has(file.id));
  const repoCommitCandidates = commitCandidates[repo.id] ?? [];

  const runAction = async (action: string, handler: () => Promise<void>) => {
    setBusyAction(action);
    try {
      await handler();
    } finally {
      setBusyAction(null);
    }
  };

  const refreshAndSync = async () => {
    await onRefresh();
  };

  const handleToggleStaged = (id: string) => {
    const file = files.find(item => item.id === id);
    if (!file) return;
    void runAction('toggle-stage', async () => {
      await mutateRepo(repo.id, file.staged ? 'unstage-file' : 'stage-file', settings, { fileId: file.id, filePath: file.path });
      await refreshAndSync();
    });
  };

  const handleStageAll = () => void runAction('stage-all', async () => {
    await mutateRepo(repo.id, 'stage-all', settings);
    await refreshAndSync();
  });
  const handleUnstageAll = () => void runAction('unstage-all', async () => {
    await mutateRepo(repo.id, 'unstage-all', settings);
    await refreshAndSync();
  });
  const handleCommit = () => void runAction('commit', async () => {
    await mutateRepo(repo.id, 'commit', settings, { message: commitMessage });
    setCommitMessage('');
    await refreshAndSync();
  });
  const handlePull = () => void runAction('pull', async () => {
    await mutateRepo(repo.id, 'pull', settings);
    await refreshAndSync();
  });
  const handlePush = () => void runAction('push', async () => {
    await mutateRepo(repo.id, 'push', settings);
    await refreshAndSync();
  });
  const handleRefresh = () => void runAction('refresh', refreshAndSync);
  const handleOpenFolder = () => void runAction('open-folder', async () => {
    await invokeLocalRepoAction(repo.id, 'open-folder', settings, repo.path);
  });
  const handleOpenTerminal = () => void runAction('open-terminal', async () => {
    await invokeLocalRepoAction(repo.id, 'open-terminal', settings, repo.path);
  });
  const handleOpenConflicts = () => void runAction('open-conflicts', async () => {
    await invokeLocalRepoAction(repo.id, 'open-conflicts', settings, repo.path);
  });
  const handleViewLog = () => void runAction('log', async () => {
    const log = await fetchRepoLog(repo.id, settings);
    if (log) onShowLog(log);
  });
  const handleGenerateCommit = (styleHint?: string) => void runAction('generate', async () => {
    try {
      setAiError(null);
      const result = await generateCommitCandidates(repo.id, settings, styleHint);
      setAiCandidates(styleHint && result.candidates.length === 1 && aiCandidates.length > 0
        ? aiCandidates.map(candidate => candidate.style === styleHint ? result.candidates[0] : candidate)
        : result.candidates);
      if (!styleHint && result.candidates[0]) {
        setCommitMessage(result.candidates[0].full);
      }
    } catch (error) {
      setAiError(error instanceof Error ? error.message : 'AI 生成失败');
    }
  });

  const totalAdded = fileSummary.added;
  const totalModified = fileSummary.modified;
  const totalDeleted = fileSummary.deleted;
  const isConflict = repo.conflicts > 0;
  const hasStaged = stagedIds.size > 0;
  const hasCommitMsg = commitMessage.trim().length > 0;
  const hasPull = repo.behind > 0;
  const hasPush = repo.ahead > 0;

  const mainTabs: { key: MainTab; label: string }[] = [
    { key: 'changes', label: `变更 ${fileSummary.total > 0 ? `(${fileSummary.total})` : ''}` },
    { key: 'staged', label: `已暂存 (${stagedIds.size})` },
    { key: 'history', label: '历史' },
    { key: 'activity', label: '活动' },
  ];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: C.appBg }}>
      <div style={{ background: C.panel1, borderBottom: `1px solid ${C.border}`, padding: '10px 16px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ color: C.textPrimary, fontSize: 15, fontWeight: 600 }}>{repo.name}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 5, padding: '2px 8px' }}>
                <GitBranch size={11} color={C.btnPrimary} />
                <span style={{ color: C.btnPrimary, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}>{repo.branch}</span>
              </div>
              <span style={{ color: C.textWeak, fontSize: 10 }}>→</span>
              <span style={{ color: C.textWeak, fontSize: 11 }}>{repo.remote}</span>
              {repo.ahead > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 3, color: C.needPush, fontSize: 11 }}>
                  <ArrowUp size={11} /> {repo.ahead} 待 Push
                </div>
              )}
              {repo.behind > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 3, color: C.needPull, fontSize: 11 }}>
                  <ArrowDown size={11} /> {repo.behind} 待 Pull
                </div>
              )}
              {isConflict && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 3, color: C.conflict, fontSize: 11 }}>
                  <AlertTriangle size={11} /> {repo.conflicts} 个冲突
                </div>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <span style={{ color: C.textWeak, fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}>{repo.path}</span>
              {fileSummary.total > 0 && (
                <>
                  <span style={{ color: C.textWeak, fontSize: 10 }}>·</span>
                  <span style={{ color: C.textSecondary, fontSize: 10 }}>
                    {fileSummary.total} 处变更 ·
                    <span style={{ color: C.added }}> +{totalAdded} 新增</span> ·
                    <span style={{ color: C.modified }}> ~{totalModified} 修改</span> ·
                    <span style={{ color: C.deleted }}> -{totalDeleted} 删除</span>
                  </span>
                </>
              )}
              <span style={{ color: C.textWeak, fontSize: 10 }}>· 更新于 {repo.lastScan}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
            <button onClick={handleOpenFolder} style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.textSecondary, borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
              <FolderOpen size={11} /> 文件夹
            </button>
            <button onClick={handleOpenTerminal} style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.textSecondary, borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Terminal size={11} /> 终端
            </button>
            <button
              onClick={onOpenSettings}
              style={{
                background: C.panel2,
                border: `1px solid ${C.border}`,
                color: C.textSecondary,
                borderRadius: 6,
                padding: '5px 8px',
                cursor: 'pointer',
                fontSize: 11,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <Settings2 size={13} />
            </button>
          </div>
        </div>
      </div>

      <div style={{ background: C.panel2, borderBottom: `1px solid ${C.border}`, padding: '8px 14px', display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
        <ToolbarBtn label="全部暂存" icon={<PlusSquare size={12} />} onClick={handleStageAll} disabled={busyAction !== null || files.length === 0 || stagedIds.size === files.length} />
        <ToolbarBtn label="全部取消暂存" icon={<MinusSquare size={12} />} onClick={handleUnstageAll} disabled={busyAction !== null || stagedIds.size === 0} />
        <div style={{ width: 1, height: 18, background: C.border, margin: '0 2px' }} />
        <ToolbarBtn label={busyAction === 'generate' ? '生成中…' : '生成 AI 提交信息'} icon={<Sparkles size={12} />} disabled={busyAction !== null || !hasStaged} accent onClick={() => handleGenerateCommit()} />
        <ToolbarBtn label={busyAction === 'commit' ? '提交中…' : '提交'} icon={<GitCommit size={12} />} disabled={busyAction !== null || !hasStaged || !hasCommitMsg} primary onClick={handleCommit} />
        <div style={{ width: 1, height: 18, background: C.border, margin: '0 2px' }} />
        <ToolbarBtn label={busyAction === 'pull' ? 'Pull 中…' : 'Pull'} icon={<Download size={12} />} disabled={busyAction !== null} warning={hasPull && repo.modified > 0} onClick={handlePull} />
        <ToolbarBtn label={busyAction === 'push' ? 'Push 中…' : 'Push'} icon={<Upload size={12} />} disabled={busyAction !== null} dimmed={!hasPush} onClick={handlePush} />
        <div style={{ flex: 1 }} />
        <button
          onClick={handleRefresh}
          disabled={busyAction !== null}
          style={{ background: 'none', border: 'none', color: C.textWeak, cursor: busyAction !== null ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '4px 6px', opacity: busyAction !== null ? 0.5 : 1 }}
        >
          <RefreshCw size={11} /> 刷新
        </button>
      </div>

      {isConflict && <ConflictBanner repo={repo} onOpenConflicts={handleOpenConflicts} onViewLog={handleViewLog} />}

      <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${C.border}`, background: C.panel1, flexShrink: 0, padding: '0 14px' }}>
        {mainTabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setMainTab(tab.key)}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: `2px solid ${mainTab === tab.key ? C.btnPrimary : 'transparent'}`,
              color: mainTab === tab.key ? C.textPrimary : C.textWeak,
              padding: '8px 14px',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: mainTab === tab.key ? 500 : 400,
              transition: 'all 0.1s',
              whiteSpace: 'nowrap',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {mainTab === 'history' ? (
        <HistoryTab commits={repo.history} />
      ) : mainTab === 'activity' ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textWeak, fontSize: 12 }}>
          暂无活动记录
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          <DiffList
            files={files}
            selectedFileId={selectedFileId}
            onSelectFile={id => setSelectedFileId(id)}
            stagedIds={stagedIds}
            onToggleStaged={handleToggleStaged}
            onStageAll={handleStageAll}
            onUnstageAll={handleUnstageAll}
          />
          <div style={{ flex: 1.1, minWidth: 0, display: 'flex', borderRight: `1px solid ${C.border}` }}>
            <DiffPreview diff={diff} loading={loadingDiff} />
          </div>
          <div style={{ width: 360, flexShrink: 0, display: 'flex' }}>
            <AiCommitPanel
              settings={settings}
              stagedCount={stagedIds.size}
              stagedPaths={stagedFiles.map(file => file.path)}
              candidates={aiCandidates.length > 0 ? aiCandidates : repoCommitCandidates}
              loading={busyAction === 'generate'}
              message={commitMessage}
              error={aiError}
              onGenerate={() => handleGenerateCommit()}
              onRegenerateStyle={style => handleGenerateCommit(style)}
              onMessageChange={setCommitMessage}
            />
          </div>
        </div>
      )}
    </div>
  );
}
