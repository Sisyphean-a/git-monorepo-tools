import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { C } from '../theme';
import { AiCommitPanel } from './ai-commit-panel';
import { DiffList } from './diff-list';
import { ConflictBanner, RepoHeader, summarizeFiles } from './workspace-parts';
import { RepoHistoryTab } from './repo-history-tab';
import { useAppBackend } from '../application/backend-context';
import { useRepoCommandPanel } from '../features/commands/use-repo-command-panel';
import { registerTerminalSession, setRepoTerminalFailed, setRepoTerminalStarting } from '../features/terminal/repo-terminal-status';
import { createFileDiffLoader } from '../features/diff/file-diff-loader';
import type {
  AppSettings,
  RepoCommandResult,
  RepoDetail,
  RepoMutationAction,
  SettingsTab,
} from '../domain/types';

type MainTab = 'changes' | 'history' | 'terminal' | `terminal-${number}`;

interface IndependentTerminal {
  id: `terminal-${number}`;
  repoId: string;
}

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
  const [independentTerminals, setIndependentTerminals] = useState<IndependentTerminal[]>([]);
  const terminalSequence = useRef(1);

  useEffect(() => {
    if (mainTab === 'terminal' || independentTerminals.some(tab => tab.id === mainTab)) {
      setTerminalEnabled(true);
    }
  }, [mainTab, independentTerminals]);

  useEffect(() => {
    setIndependentTerminals(current => {
      const next = current.filter(tab => Boolean(repoDetails[tab.repoId]));
      return next.length === current.length ? current : next;
    });
  }, [repoDetails]);

  useEffect(() => {
    if (mainTab !== 'changes' && mainTab !== 'history' && mainTab !== 'terminal' && !independentTerminals.some(tab => tab.id === mainTab)) {
      setMainTab('changes');
    }
  }, [mainTab, independentTerminals]);

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
  // RepoDetail identity changes for every applied snapshot, even within the same second.
  const fileDiffLoader = useMemo(
    () => createFileDiffLoader(file => backend.fetchFileDiff({
      repoId: repo.id,
      filePath: file.path,
      staged: file.staged,
      settings,
      target: { path: repo.path, category: repo.category },
    })),
    [backend, repo, settings],
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
  const openIndependentTerminal = () => {
    if (isChecking) return;
    const number = ++terminalSequence.current;
    const id = `terminal-${number}` as IndependentTerminal['id'];
    setIndependentTerminals(current => [...current, { id, repoId: repo.id }]);
    setMainTab(id);
  };
  const closeIndependentTerminal = (id: IndependentTerminal['id']) => {
    setIndependentTerminals(current => current.filter(tab => tab.id !== id));
    setMainTab(current => current === id ? 'terminal' : current);
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

      <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${C.border}`, background: C.panel1, flexShrink: 0, padding: '0 14px', overflowX: 'auto' }}>
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
        {independentTerminals.map(tab => (
          <div
            key={tab.id}
            style={{ display: 'flex', alignItems: 'center', borderBottom: `2px solid ${mainTab === tab.id ? C.btnPrimary : 'transparent'}`, whiteSpace: 'nowrap' }}
          >
            <button
              type="button"
              disabled={isChecking}
              onClick={() => setMainTab(tab.id)}
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
              <DiffList key={repo.id} files={repo.files} revision={repo.scannedAt} diffLoader={fileDiffLoader} />
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
                {independentTerminals.map(tab => {
                  const terminalRepo = repoDetails[tab.repoId];
                  return terminalRepo ? <IndependentTerminalTab key={tab.id} repo={terminalRepo} visible={mainTab === tab.id} /> : null;
                })}
              </Suspense>
            )}
          </>
        )}
      </div>
    </div>
  );
}
