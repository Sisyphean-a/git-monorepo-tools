import { useState } from 'react';
import { fetchRepoLog, invokeLocalRepoAction, mutateRepo, pickFolder, refreshRepo, runBatch, runRepoCommand } from './api';
import { C } from './theme';
import { Sidebar } from './components/sidebar';
import { Workspace } from './components/workspace';
import { PullAllDrawer } from './components/pull-all-drawer';
import { SettingsModal } from './components/settings-modal';
import { AddRepoMenu } from './components/add-repo-menu';
import { LogViewerModal } from './components/log-viewer-modal';
import { loadSettings, saveSettings, sanitizeSettings } from './settings';
import { viewRepoLog } from './repo-log';
import type { AppSettings, AppSnapshot, PullResult, RepoLog, RepoMutationAction, RepoSnapshotUpdate, SettingsTab } from './types';
import { mergeRepoSnapshotUpdate } from './repo-snapshot-merge';
import { useSnapshotRefresh } from './use-snapshot-refresh';
import { useProgressiveStartupScan } from './use-progressive-startup-scan';

function AppFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: C.appBg,
        color: C.textPrimary,
        fontFamily: 'Inter, system-ui, sans-serif',
        overflow: 'hidden',
        fontSize: 14,
      }}
    >
      {children}
    </div>
  );
}

function formatActionError(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function App() {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [selectedRepoId, setSelectedRepoId] = useState('');
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showPullDrawer, setShowPullDrawer] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('ai-commit');
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [drawerOperation, setDrawerOperation] = useState<'pullAll' | 'pushAll'>('pullAll');
  const [drawerResults, setDrawerResults] = useState<PullResult[]>([]);
  const [drawerScannedAt, setDrawerScannedAt] = useState('');
  const [repoLog, setRepoLog] = useState<RepoLog | null>(null);
  const [sidebarBatchAction, setSidebarBatchAction] = useState<'pull' | 'push' | null>(null);
  const [sidebarRefreshing, setSidebarRefreshing] = useState(false);

  const applySnapshot = (nextSnapshot: AppSnapshot) => {
    setSnapshot(nextSnapshot);
    setSelectedRepoId(current => nextSnapshot.repoDetails[current] ? current : nextSnapshot.selectedRepoId);
  };

  const applyRepoUpdate = (update: RepoSnapshotUpdate) => {
    setSnapshot(current => (current ? mergeRepoSnapshotUpdate(current, update) : current));
    setSelectedRepoId(current => current || update.repo.id);
  };

  const snapshotRefresh = useSnapshotRefresh(
    settings,
    applySnapshot,
    setRefreshError,
    { skipInitialRefresh: true },
  );
  const { refreshSnapshot, runQueuedTask } = snapshotRefresh;
  const { retryStartupScan } = useProgressiveStartupScan(
    settings,
    selectedRepoId,
    applySnapshot,
    applyRepoUpdate,
    setRefreshError,
    snapshotRefresh,
  );

  const handleSidebarRefresh = async () => {
    if (sidebarRefreshing) return;
    setSidebarRefreshing(true);
    try {
      await refreshSnapshot();
    } catch {
    } finally {
      setSidebarRefreshing(false);
    }
  };

  const handleBatch = async (operation: 'pull' | 'push') => {
    setSidebarBatchAction(operation);
    try {
      const result = await runQueuedTask(
        () => runBatch(operation, settings),
        response => response.updates?.forEach(applyRepoUpdate),
      );
      setDrawerOperation(result.operation ?? (operation === 'pull' ? 'pullAll' : 'pushAll'));
      setDrawerResults(result.results ?? []);
      setDrawerScannedAt(result.scannedAt);
      setShowPullDrawer(true);
    } catch {
    } finally {
      setSidebarBatchAction(null);
    }
  };

  const handleSaveSettings = (nextSettings: AppSettings) => {
    const sanitized = sanitizeSettings(nextSettings);
    setSettings(sanitized);
    saveSettings(sanitized);
    setShowSettings(false);
    void refreshSnapshot(sanitized).catch(() => {});
  };

  const handleToggleAutoScan = () => {
    const nextSettings = sanitizeSettings({
      ...settings,
      gitBehavior: {
        ...settings.gitBehavior,
        autoScanEnabled: !settings.gitBehavior.autoScanEnabled,
      },
    });
    setSettings(nextSettings);
    saveSettings(nextSettings);
  };

  const handleAddScanRoot = async () => {
    const folder = await pickFolder();
    if (!folder) return;
    const exists = settings.scanRoots.some(item => item.path.toLowerCase() === folder.toLowerCase());
    if (exists) return;
    const rootName = folder.split('/').at(-1) ?? '自定义工作区';
    const nextSettings = sanitizeSettings({
      ...settings,
      scanRoots: [...settings.scanRoots, { path: folder, category: `${rootName} 工作区` }],
    });
    setSettings(nextSettings);
    saveSettings(nextSettings);
    await refreshSnapshot(nextSettings).catch(() => {});
    setShowAddMenu(false);
  };

  const handleAddCategory = () => {
    const name = window.prompt('输入新分类名称');
    if (!name?.trim()) return;
    const nextSettings = sanitizeSettings({
      ...settings,
      customCategories: [...settings.customCategories, name.trim()],
    });
    setSettings(nextSettings);
    saveSettings(nextSettings);
    setShowAddMenu(false);
  };

  const handleRemoveScanRoot = (path: string) => {
    const nextSettings = sanitizeSettings({
      ...settings,
      scanRoots: settings.scanRoots.filter(item => item.path !== path),
    });
    setSettings(nextSettings);
    saveSettings(nextSettings);
    void refreshSnapshot(nextSettings).catch(() => {});
  };

  const handleRetryRepo = async (repoId: string, operation: 'pullAll' | 'pushAll') => {
    try {
      await runQueuedTask(
        () => mutateRepo(repoId, operation === 'pullAll' ? 'pull' : 'push', settings),
        applyRepoUpdate,
      );
      setDrawerResults(current => current.map(result => (
        result.id === repoId
          ? {
              ...result,
              result: operation === 'pullAll' ? 'pulled' : 'pushed',
              detail: operation === 'pullAll' ? '已完成重试拉取' : '已完成重试推送',
            }
          : result
      )));
    } catch (error) {
      setDrawerResults(current => current.map(result => (
        result.id === repoId
          ? {
              ...result,
              result: 'failed',
              detail: error instanceof Error ? error.message : '重试失败',
            }
          : result
      )));
    }
  };

  const handleOpenRepoFromDrawer = async (path: string) => {
    try {
      await invokeLocalRepoAction('open-folder', path);
      setActionError(null);
    } catch (error) {
      setActionError(formatActionError(error, '打开目录失败'));
    }
  };

  const handleMutateRepo = (repoId: string, action: RepoMutationAction, body?: Record<string, unknown>) => (
    runQueuedTask(
      () => mutateRepo(repoId, action, settings, body),
      applyRepoUpdate,
    )
  );

  const handleWorkspaceRefresh = (repoId: string) => (
    runQueuedTask(
      () => refreshRepo(
        repoId,
        settings,
        { refreshRemotes: false },
        readRepoRefreshTarget(snapshot, repoId),
      ),
      applyRepoUpdate,
    )
  );

  const handleInvokeLocalRepoAction = async (action: 'open-folder' | 'open-terminal' | 'open-conflicts', path: string) => {
    try {
      await invokeLocalRepoAction(action, path);
      setActionError(null);
    } catch (error) {
      setActionError(formatActionError(error, '本地操作失败'));
      throw error;
    }
  };

  const visibleError = actionError ?? refreshError;

  const handleViewRepoLog = async (repoId: string) => {
    await viewRepoLog(repoId, settings, {
      onSuccess: log => setRepoLog(log),
      onError: setActionError,
      fetchLog: fetchRepoLog,
    });
  };

  const handleViewRepoLogFromDrawer = (repoId: string) => {
    // Drawer actions already surface failures via actionError; avoid an extra unhandled rejection.
    void handleViewRepoLog(repoId).catch(() => {});
  };

  if (!snapshot) {
    return (
      <AppFrame>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: C.textWeak, fontSize: 12, gap: 10 }}>
          <div>{refreshError ? `扫描失败：${refreshError}` : '正在扫描仓库...'}</div>
          {refreshError && (
            <button
              onClick={() => retryStartupScan()}
              style={{ background: C.panel2, color: C.textSecondary, border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 12 }}
            >
              重试扫描
            </button>
          )}
        </div>
      </AppFrame>
    );
  }

  return (
    <AppFrame>
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <Sidebar
          repos={snapshot.repos}
          categories={[...snapshot.categories, ...settings.customCategories.filter(category => !snapshot.categories.includes(category))]}
          scannedAt={snapshot.scannedAt}
          settings={settings}
          batchAction={sidebarBatchAction}
          isRefreshing={sidebarRefreshing}
          recentError={visibleError}
          selectedRepoId={selectedRepoId}
          onSelectRepo={id => setSelectedRepoId(id)}
          onPullAll={() => void handleBatch('pull')}
          onPushAll={() => void handleBatch('push')}
          onRefresh={() => void handleSidebarRefresh()}
          onOpenAddMenu={() => setShowAddMenu(true)}
          onToggleAutoScan={handleToggleAutoScan}
        />
        <Workspace
          repoDetails={snapshot.repoDetails}
          settings={settings}
          selectedRepoId={selectedRepoId}
          onRefresh={handleWorkspaceRefresh}
          onMutateRepo={handleMutateRepo}
          onInvokeLocalRepoAction={handleInvokeLocalRepoAction}
          onRunCustomCommand={(repoPath, command, streamId) => runRepoCommand(repoPath, command, streamId, settings)}
          onOpenSettings={(tab = 'git-behavior') => {
            setSettingsTab(tab);
            setShowSettings(true);
          }}
          onViewLog={handleViewRepoLog}
        />
      </div>
      <AddRepoMenu
        open={showAddMenu}
        onClose={() => setShowAddMenu(false)}
        onAddFolder={() => void handleAddScanRoot()}
        onAddCategory={handleAddCategory}
      />
      <PullAllDrawer
        open={showPullDrawer}
        operation={drawerOperation}
        results={drawerResults}
        scannedAt={drawerScannedAt || snapshot.scannedAt}
        onClose={() => setShowPullDrawer(false)}
        onOpenRepo={path => void handleOpenRepoFromDrawer(path)}
        onViewLog={handleViewRepoLogFromDrawer}
        onRetry={(repoId, operation) => void handleRetryRepo(repoId, operation)}
      />
      <SettingsModal
        repos={snapshot.repos}
        settings={settings}
        open={showSettings}
        initialTab={settingsTab}
        onClose={() => setShowSettings(false)}
        onSave={handleSaveSettings}
        onAddScanRoot={handleAddScanRoot}
        onAddCategory={handleAddCategory}
        onRemoveScanRoot={handleRemoveScanRoot}
      />
      <LogViewerModal log={repoLog} onClose={() => setRepoLog(null)} />
    </AppFrame>
  );
}

function readRepoRefreshTarget(snapshot: AppSnapshot | null, repoId: string) {
  if (!snapshot) {
    return undefined;
  }
  const repo = snapshot.repoDetails[repoId] ?? snapshot.repos.find(item => item.id === repoId);
  if (!repo) {
    return undefined;
  }
  return {
    path: repo.path,
    category: repo.category,
  };
}
