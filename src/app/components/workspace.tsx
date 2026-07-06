import { Suspense, lazy, useEffect, useState } from 'react';
import { C } from '../theme';
import { AiCommitPanel } from './ai-commit-panel';
import { DiffList } from './diff-list';
import { ConflictBanner, HistoryTab, RepoHeader, summarizeFiles } from './workspace-parts';
import { useRepoCommandPanel } from '../use-repo-command-panel';
import type {
  AppSettings,
  RepoCommandResult,
  RepoDetail,
  RepoMutationAction,
  SettingsTab,
} from '../types';

type MainTab = 'changes' | 'history' | 'terminal';
const RepoTerminalTab = lazy(async () => ({ default: (await import('./repo-terminal-tab')).RepoTerminalTab }));

interface WorkspaceProps {
  repoDetails: Record<string, RepoDetail>;
  settings: AppSettings;
  selectedRepoId: string;
  onRefresh: (repoId: string) => Promise<void>;
  onMutateRepo: (repoId: string, action: RepoMutationAction, body?: Record<string, unknown>) => Promise<void>;
  onInvokeLocalRepoAction: (action: 'open-folder' | 'open-terminal' | 'open-conflicts', path: string) => Promise<void>;
  onRunCustomCommand: (repoPath: string, command: string, streamId?: string) => Promise<RepoCommandResult>;
  onOpenSettings: (tab?: SettingsTab) => void;
  onViewLog: (repoId: string) => Promise<void>;
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
  onViewLog,
}: WorkspaceProps) {
  const repoIds = Object.keys(repoDetails);
  const repo = repoDetails[selectedRepoId] ?? (repoIds[0] ? repoDetails[repoIds[0]] : undefined);
  const [mainTab, setMainTab] = useState<MainTab>('changes');
  const [terminalEnabled, setTerminalEnabled] = useState(false);

  useEffect(() => {
    if (mainTab === 'terminal') {
      setTerminalEnabled(true);
    }
  }, [mainTab]);

  if (!repo) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textWeak, fontSize: 12 }}>
        未发现可展示的仓库
      </div>
    );
  }

  const fileSummary = summarizeFiles(repo.files);

  const {
    stagedIds,
    commitMessage,
    aiError,
    topAction,
    actionGroups,
    commandSections,
    commandConsole,
    handleToggleStaged,
    setCommitMessage,
    clearCommandConsole,
  } = useRepoCommandPanel({
    repo,
    settings,
    onRefresh: () => onRefresh(repo.id),
    onMutateRepo,
    onRunCustomCommand,
    onOpenCommandsSettings: () => onOpenSettings('commands'),
  });

  const handleOpenFolder = () => void onInvokeLocalRepoAction('open-folder', repo.path).catch(() => {});
  const handleOpenTerminal = () => setMainTab('terminal');
  const handleOpenConflicts = () => void onInvokeLocalRepoAction('open-conflicts', repo.path).catch(() => {});
  const handleViewLog = () => void onViewLog(repo.id).catch(() => {});
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
        onOpenSettings={() => onOpenSettings('git-behavior')}
      />

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

      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            visibility: mainTab === 'changes' ? 'visible' : 'hidden',
            pointerEvents: mainTab === 'changes' ? 'auto' : 'none',
          }}
        >
          <DiffList files={repo.files} stagedIds={stagedIds} onToggleStaged={handleToggleStaged} />
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
          <HistoryTab commits={repo.history} />
        </div>
        {terminalEnabled && (
          <Suspense fallback={null}>
            <RepoTerminalTab repoDetails={repoDetails} activeRepoId={repo.id} visible={mainTab === 'terminal'} />
          </Suspense>
        )}
      </div>
    </div>
  );
}
