import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { C } from '../theme';
import { AiCommitPanel } from './ai-commit-panel';
import { DiffList } from './diff-list';
import { ConflictBanner, RepoHeader, summarizeFiles } from './workspace-parts';
import { RepoHistoryTab } from './repo-history-tab';
import { useAppBackend } from '../application/backend-context';
import { useRepoCommandPanel } from '../features/commands/use-repo-command-panel';
import { registerTerminalSession, setRepoTerminalFailed, setRepoTerminalStarting } from '../features/terminal/repo-terminal-status';
import type {
  AppSettings,
  RepoCommandResult,
  RepoDetail,
  RepoMutationAction,
  SettingsTab,
} from '../domain/types';

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
  onViewLog,
  onError,
}: WorkspaceProps) {
  const backend = useAppBackend();
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
    settings,
    onRefresh: () => onRefresh(repo.id),
    onMutateRepo,
    onRunCustomCommand,
    onOpenCommandsSettings: () => onOpenSettings('commands'),
    backend,
  });

  const handleOpenFolder = () => void onInvokeLocalRepoAction('open-folder', repo.path).catch(error => onError(error, '打开目录失败'));
  const handleOpenTerminal = () => void onInvokeLocalRepoAction('open-terminal', repo.path).catch(error => onError(error, '打开终端失败'));
  const handleOpenConflicts = () => void onInvokeLocalRepoAction('open-conflicts', repo.path).catch(error => onError(error, '打开冲突工具失败'));
  const handleViewLog = () => void onViewLog(repo.id).catch(error => onError(error, '查看日志失败'));
  const handleLoadDiff = useCallback(
    (file: RepoDetail['files'][number]) => backend.fetchFileDiff({
      repoId: repo.id,
      filePath: file.path,
      staged: file.staged,
      settings,
      target: { path: repo.path, category: repo.category },
    }),
    [backend, repo.category, repo.id, repo.path, settings],
  );
  const handleSendToTerminal = async (command: string) => {
    setRepoTerminalStarting(repo.id);
    try {
      const session = await backend.ensureTerminalSession({ repoId: repo.id, repoPath: repo.path });
      registerTerminalSession(session);
      await backend.writeTerminalInput(session.sessionId, `${command}\r`);
    } catch (error) {
      setRepoTerminalFailed(repo.id);
      throw error;
    }
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
        onOpenSettings={() => onOpenSettings('git-behavior')}
      />

      {isConflict && <ConflictBanner repo={repo} onOpenConflicts={handleOpenConflicts} onViewLog={handleViewLog} />}

      <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${C.border}`, background: C.panel1, flexShrink: 0, padding: '0 14px' }}>
        {mainTabs.map(tab => (
          <button
            key={tab.key}
            disabled={isChecking}
            onClick={() => {
              if (!isChecking) setMainTab(tab.key);
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
              <DiffList key={repo.id} files={repo.files} revision={repo.scannedAt} onLoadDiff={handleLoadDiff} />
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
                repo={repo}
                settings={settings}
                active={mainTab === 'history'}
                onOpenTerminal={handleOpenTerminal}
                onSendToTerminal={handleSendToTerminal}
              />
            </div>
            {terminalEnabled && (
              <Suspense fallback={null}>
                <RepoTerminalTab repoDetails={repoDetails} activeRepoId={repo.id} visible={mainTab === 'terminal'} />
              </Suspense>
            )}
          </>
        )}
      </div>
    </div>
  );
}
