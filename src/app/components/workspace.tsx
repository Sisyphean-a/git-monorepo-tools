import { Suspense, lazy, useMemo } from 'react';
import { Plus, X } from 'lucide-react';
import { C } from '../theme';
import { AiCommitPanel } from './ai-commit-panel';
import { DiffList } from './diff-list';
import { ConflictBanner, RepoHeader, summarizeFiles } from './workspace-parts';
import { RepoHistoryTab } from './repo-history-tab';
import { useAppBackend } from '../application/backend-context';
import { useRepoCommandPanel } from '../features/commands/use-repo-command-panel';
import {
  useTerminalWorkspace,
  useTerminalWorkspaceTabs,
  type WorkspaceMainTab,
} from '../features/terminal/terminal-workspace';
import { createFileDiffLoader } from '../features/diff/file-diff-loader';
import type {
  AppSettings,
  DiffViewerRequest,
  RepoCommandResult,
  RepoDetail,
  RepoMutationAction,
  SettingsTab,
} from '../domain/types';

type MainTab = WorkspaceMainTab;
const RepoTerminalTab = lazy(async () => ({ default: (await import('./repo-terminal-tab')).RepoTerminalTab }));
const IndependentTerminalTab = lazy(async () => ({ default: (await import('./repo-terminal-tab')).IndependentTerminalTab }));

interface WorkspaceProps {
  repoDetails: Record<string, RepoDetail>;
  settings: AppSettings;
  selectedRepoId: string;
  onRefresh: (repoId: string) => Promise<void>;
  onMutateRepo: (repoId: string, action: RepoMutationAction, body?: Record<string, unknown>) => Promise<void>;
  onInvokeLocalRepoAction: (action: 'open-folder' | 'open-terminal' | 'open-conflicts', path: string) => Promise<void>;
  onRunCustomCommand: (repoPath: string, command: string, streamId?: string) => Promise<RepoCommandResult>;
  onOpenSettings: (tab?: SettingsTab) => void;
  onOpenCommands: () => void;
  onOpenDiffViewer: (request: DiffViewerRequest) => void;
  onViewLog: (repoId: string) => Promise<void>;
  onError: (error: unknown, fallback: string) => void;
}

function ScanningPlaceholderCard({
  title,
  lines,
}: {
  title: string;
  lines: string[];
}) {
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        background: C.panel1,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div style={{ color: C.textSecondary, fontSize: 12, fontWeight: 600 }}>{title}</div>
      {lines.map((line, index) => (
        <div
          key={`${title}-${index}`}
          style={{
            height: 12,
            width: line,
            borderRadius: 999,
            background: C.panel3,
            border: `1px solid ${C.border}`,
          }}
        />
      ))}
    </div>
  );
}

function WorkspaceScanningState() {
  return (
    <div style={{ flex: 1, minHeight: 0, padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 16 }}>
        <ScanningPlaceholderCard
          title="变更列表"
          lines={['62%', '88%', '76%', '70%', '92%', '64%', '80%']}
        />
        <div style={{ width: 420, flexShrink: 0, display: 'flex' }}>
          <ScanningPlaceholderCard
            title="提交面板"
            lines={['54%', '100%', '100%', '72%', '86%', '68%']}
          />
        </div>
      </div>
    </div>
  );
}

export function Workspace({
  repoDetails,
  settings,
  selectedRepoId,
  onRefresh,
  onMutateRepo,
  onInvokeLocalRepoAction,
  onRunCustomCommand,
  onOpenSettings,
  onOpenCommands,
  onOpenDiffViewer,
  onViewLog,
  onError,
}: WorkspaceProps) {
  const backend = useAppBackend();
  const terminalWorkspace = useTerminalWorkspace();
  const terminalTabs = useTerminalWorkspaceTabs(repoDetails, selectedRepoId);
  const repoIds = useMemo(() => Object.keys(repoDetails), [repoDetails]);
  const repo = repoDetails[terminalTabs.activeRepoId];

  if (!repo) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textWeak, fontSize: 12 }}>
        未发现可展示的仓库
      </div>
    );
  }

  const {
    mainTab,
    terminalEnabled,
    independentTerminals,
    repoIndependentTerminals,
    selectMainTab,
    openIndependentTerminal,
    closeIndependentTerminal,
  } = terminalTabs;
  const fileSummary = summarizeFiles(repo.files);
  const isChecking = repo.status === 'checking';

  const {
    commitMessage,
    aiError,
    topAction,
    actionGroups,
    commandSections,
    commandConsole,
    setCommitMessage,
    clearCommandConsole,
  } = useRepoCommandPanel({
    repo,
    repoIds,
    settings,
    onRefresh: () => onRefresh(repo.id),
    onMutateRepo,
    onRunCustomCommand,
    onOpenCommands: onOpenCommands,
    backend,
  });

  const handleOpenFolder = () => void onInvokeLocalRepoAction('open-folder', repo.path).catch(error => onError(error, '打开目录失败'));
  const handleOpenTerminal = () => void onInvokeLocalRepoAction('open-terminal', repo.path).catch(error => onError(error, '打开终端失败'));
  const handleOpenConflicts = () => void onInvokeLocalRepoAction('open-conflicts', repo.path).catch(error => onError(error, '打开冲突工具失败'));
  const handleViewLog = () => void onViewLog(repo.id).catch(error => onError(error, '查看日志失败'));
  const fileDiffLoader = useMemo(
    () => createFileDiffLoader(file => backend.fetchFileDiff({
      repoId: repo.id,
      filePath: file.path,
      status: file.status,
      staged: file.staged,
      untracked: Boolean(file.untracked),
      settings,
      target: { path: repo.path, category: repo.category },
    })),
    // Rule: periodic snapshots replace RepoDetail objects; only stable request inputs may reload an open diff.
    [backend, repo.id, repo.path, repo.category, settings],
  );
  const handleSendToTerminal = async (command: string) => {
    await terminalWorkspace.sendToDefaultSession(
      { repoId: repo.id, repoPath: repo.path },
      `${command}\r`,
    );
  };
  const isConflict = repo.conflicts > 0;

  const mainTabs: { key: MainTab; label: string }[] = [
    { key: 'changes', label: `变更 ${fileSummary.total > 0 ? `(${fileSummary.total})` : ''}` },
    { key: 'history', label: '历史' },
    { key: 'terminal', label: '终端' },
  ];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: C.appBg }}>
      <RepoHeader
        repo={repo}
        fileSummary={fileSummary}
        onOpenFolder={handleOpenFolder}
        onOpenTerminal={handleOpenTerminal}
        onOpenDiffViewer={() => onOpenDiffViewer({ kind: 'working', repoId: repo.id })}
        onOpenSettings={() => onOpenSettings('git-behavior')}
      />

      {isConflict && <ConflictBanner repo={repo} onOpenConflicts={handleOpenConflicts} onViewLog={handleViewLog} />}

      <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${C.border}`, background: C.panel1, flexShrink: 0, padding: '0 14px', overflowX: 'auto' }}>
        {mainTabs.map(tab => (
          <button
            key={tab.key}
            disabled={isChecking}
            onClick={() => {
              if (!isChecking) selectMainTab(tab.key);
            }}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: `2px solid ${mainTab === tab.key ? C.btnPrimary : 'transparent'}`,
              color: mainTab === tab.key ? C.textPrimary : C.textWeak,
              padding: '8px 14px',
              cursor: isChecking ? 'default' : 'pointer',
              fontSize: 12,
              fontWeight: mainTab === tab.key ? 500 : 400,
              transition: 'all 0.1s',
              opacity: isChecking ? 0.65 : 1,
              whiteSpace: 'nowrap',
            }}
          >
            {tab.label}
          </button>
        ))}
        {repoIndependentTerminals.map(tab => (
          <div
            key={tab.id}
            style={{ display: 'flex', alignItems: 'center', borderBottom: `2px solid ${mainTab === tab.id ? C.btnPrimary : 'transparent'}`, whiteSpace: 'nowrap' }}
          >
            <button
              type="button"
              disabled={isChecking}
              onClick={() => selectMainTab(tab.id)}
              style={{ background: 'none', border: 'none', color: mainTab === tab.id ? C.textPrimary : C.textWeak, padding: '8px 4px 8px 14px', cursor: isChecking ? 'default' : 'pointer', fontSize: 12, fontWeight: mainTab === tab.id ? 500 : 400, opacity: isChecking ? 0.65 : 1 }}
            >
              终端
            </button>
            <button
              type="button"
              aria-label="关闭终端"
              title="关闭终端"
              disabled={isChecking}
              onClick={() => closeIndependentTerminal(tab.id)}
              style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', color: C.textWeak, cursor: isChecking ? 'default' : 'pointer', padding: '5px 8px 5px 5px', opacity: isChecking ? 0.65 : 1 }}
            >
              <X size={13} />
            </button>
          </div>
        ))}
        <button
          type="button"
          aria-label="新建终端"
          title="新建终端"
          disabled={isChecking}
          onClick={openIndependentTerminal}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', alignSelf: 'center', background: 'none', border: 'none', color: C.textSecondary, cursor: isChecking ? 'default' : 'pointer', padding: '5px 7px', opacity: isChecking ? 0.65 : 1 }}
        >
          <Plus size={15} />
        </button>
      </div>

      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {isChecking ? (
          <WorkspaceScanningState />
        ) : (
          <>
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                visibility: mainTab === 'changes' ? 'visible' : 'hidden',
                pointerEvents: mainTab === 'changes' ? 'auto' : 'none',
              }}
            >
              <DiffList key={repo.id} files={repo.files} diffLoader={fileDiffLoader} />
              <div style={{ width: 420, flexShrink: 0, display: 'flex', borderLeft: `1px solid ${C.border}` }}>
                <AiCommitPanel
                  topAction={topAction}
                  message={commitMessage}
                  error={aiError}
                  actionGroups={actionGroups}
                  commandSections={commandSections}
                  commandConsole={commandConsole}
                  onMessageChange={setCommitMessage}
                  onClearConsole={clearCommandConsole}
                />
              </div>
            </div>
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                visibility: mainTab === 'history' ? 'visible' : 'hidden',
                pointerEvents: mainTab === 'history' ? 'auto' : 'none',
              }}
            >
              <RepoHistoryTab
                key={`${repo.id}:${repo.historyRevision ?? 'initial'}`}
                repoId={repo.id}
                initialCommits={repo.history}
                initialTotal={repo.historyTotal}
                initialHasMore={repo.historyHasMore}
                settings={settings}
                active={mainTab === 'history'}
                onOpenTerminal={handleOpenTerminal}
                onSendToTerminal={handleSendToTerminal}
                onOpenDiffViewer={detail => onOpenDiffViewer({ kind: 'commit', repoId: repo.id, commitHash: detail.hash, commitDetail: detail })}
              />
            </div>
            {terminalEnabled && (
              <Suspense fallback={null}>
                <RepoTerminalTab repoDetails={repoDetails} activeRepoId={repo.id} visible={mainTab === 'terminal'} />
                {independentTerminals.map(tab => {
                  const terminalRepo = repoDetails[tab.repoId];
                  return terminalRepo ? <IndependentTerminalTab key={tab.id} repo={terminalRepo} visible={tab.repoId === repo.id && mainTab === tab.id} /> : null;
                })}
              </Suspense>
            )}
          </>
        )}
      </div>
    </div>
  );
}
