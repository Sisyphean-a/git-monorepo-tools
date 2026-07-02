import { useEffect, useState } from 'react';
import {
  Download,
  GitCommit,
  MinusSquare,
  PlusSquare,
  RefreshCw,
  Sparkles,
  Upload,
} from 'lucide-react';
import { generateCommitMessage } from '../api';
import { C } from '../theme';
import { AiCommitPanel } from './ai-commit-panel';
import { DiffList } from './diff-list';
import { ConflictBanner, HistoryTab, RepoHeader, ToolbarBtn, summarizeFiles } from './workspace-parts';
import type { AppSettings, RepoDetail } from '../types';

type MainTab = 'changes' | 'history';

interface WorkspaceProps {
  repoDetails: Record<string, RepoDetail>;
  settings: AppSettings;
  selectedRepoId: string;
  onRefresh: () => void;
  onMutateRepo: (repoId: string, action: 'stage-all' | 'unstage-all' | 'stage-file' | 'unstage-file' | 'commit' | 'pull' | 'push', body?: Record<string, unknown>) => Promise<void>;
  onInvokeLocalRepoAction: (action: 'open-folder' | 'open-terminal' | 'open-conflicts', path: string) => Promise<void>;
  onOpenSettings: () => void;
  onViewLog: (repoId: string) => Promise<void>;
}

export function Workspace({
  repoDetails,
  settings,
  selectedRepoId,
  onRefresh,
  onMutateRepo,
  onInvokeLocalRepoAction,
  onOpenSettings,
  onViewLog,
}: WorkspaceProps) {
  const repoIds = Object.keys(repoDetails);
  const repo = repoDetails[selectedRepoId] ?? (repoIds[0] ? repoDetails[repoIds[0]] : undefined);
  const [mainTab, setMainTab] = useState<MainTab>('changes');
  const [commitMessage, setCommitMessage] = useState('');
  const [stagedIds, setStagedIds] = useState<Set<string>>(new Set());
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  useEffect(() => {
    const nextFiles = repo?.files ?? [];
    setStagedIds(new Set(nextFiles.filter(file => file.staged).map(file => file.id)));
  }, [repo?.id, repo?.scannedAt]);

  useEffect(() => {
    setCommitMessage('');
    setAiError(null);
  }, [repo?.id]);

  if (!repo) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textWeak, fontSize: 12 }}>
        未发现可展示的仓库
      </div>
    );
  }

  const files = repo.files;
  const fileSummary = summarizeFiles(files);
  const repoActionBody = (body?: Record<string, unknown>) => ({ repoPath: repo.path, ...(body ?? {}) });

  const runAction = async (action: string, handler: () => Promise<void>) => {
    setBusyAction(action);
    try {
      await handler();
    } catch {
      // Snapshot errors are surfaced by the shared refresh error banner in App.
    } finally {
      setBusyAction(null);
    }
  };

  const handleToggleStaged = (id: string) => {
    const file = files.find(item => item.id === id);
    if (!file) return;
    void runAction('toggle-stage', async () => {
      await onMutateRepo(repo.id, file.staged ? 'unstage-file' : 'stage-file', repoActionBody({ fileId: file.id, filePath: file.path }));
    });
  };

  const handleStageAll = () => void runAction('stage-all', async () => {
    await onMutateRepo(repo.id, 'stage-all', repoActionBody());
  });
  const handleUnstageAll = () => void runAction('unstage-all', async () => {
    await onMutateRepo(repo.id, 'unstage-all', repoActionBody());
  });
  const handleCommit = () => void runAction('commit', async () => {
    await onMutateRepo(repo.id, 'commit', repoActionBody({ message: commitMessage }));
    setCommitMessage('');
  });
  const handlePull = () => void runAction('pull', async () => {
    await onMutateRepo(repo.id, 'pull', repoActionBody());
  });
  const handlePush = () => void runAction('push', async () => {
    await onMutateRepo(repo.id, 'push', repoActionBody());
  });
  const handleRefresh = () => void runAction('refresh', onRefresh);
  const handleOpenFolder = () => void runAction('open-folder', async () => {
    await onInvokeLocalRepoAction('open-folder', repo.path);
  });
  const handleOpenTerminal = () => void runAction('open-terminal', async () => {
    await onInvokeLocalRepoAction('open-terminal', repo.path);
  });
  const handleOpenConflicts = () => void runAction('open-conflicts', async () => {
    await onInvokeLocalRepoAction('open-conflicts', repo.path);
  });
  const handleViewLog = () => void runAction('log', async () => {
    await onViewLog(repo.id);
  });
  const handleGenerateCommit = () => void runAction('generate', async () => {
    try {
      setAiError(null);
      setCommitMessage(await generateCommitMessage(repo.id, settings));
    } catch (error) {
      setAiError(error instanceof Error ? error.message : 'AI 生成失败');
    }
  });

  const isConflict = repo.conflicts > 0;
  const hasStaged = stagedIds.size > 0;
  const hasCommitMsg = commitMessage.trim().length > 0;
  const hasPull = repo.behind > 0;
  const hasPush = repo.ahead > 0;

  const mainTabs: { key: MainTab; label: string }[] = [
    { key: 'changes', label: `变更 ${fileSummary.total > 0 ? `(${fileSummary.total})` : ''}` },
    { key: 'history', label: '历史' },
  ];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: C.appBg }}>
      <RepoHeader repo={repo} fileSummary={fileSummary} onOpenFolder={handleOpenFolder} onOpenTerminal={handleOpenTerminal} onOpenSettings={onOpenSettings} />

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
      ) : (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          <DiffList
            files={files}
            stagedIds={stagedIds}
            onToggleStaged={handleToggleStaged}
          />
          <div style={{ width: 380, flexShrink: 0, display: 'flex' }}>
            <AiCommitPanel
              stagedCount={stagedIds.size}
              loading={busyAction === 'generate'}
              message={commitMessage}
              error={aiError}
              onGenerate={() => handleGenerateCommit()}
              onMessageChange={setCommitMessage}
            />
          </div>
        </div>
      )}
    </div>
  );
}
