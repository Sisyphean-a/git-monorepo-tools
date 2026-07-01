import { useEffect, useRef, useState } from 'react';
import { fetchRepoLog, fetchSnapshot, invokeLocalRepoAction, mutateRepo, pickFolder, runBatch } from './api';
import { C } from './theme';
import { Sidebar } from './components/sidebar';
import { Workspace } from './components/workspace';
import { PullAllDrawer } from './components/pull-all-drawer';
import { SettingsModal } from './components/settings-modal';
import { AddRepoMenu } from './components/add-repo-menu';
import { LogViewerModal } from './components/log-viewer-modal';
import { loadSettings, saveSettings, sanitizeSettings } from './settings';
import type { AppSettings, AppSnapshot, PullResult, RepoLog, SettingsTab } from './types';

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

export default function App() {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [selectedRepoId, setSelectedRepoId] = useState('');
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [showPullDrawer, setShowPullDrawer] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('ai-commit');
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [drawerOperation, setDrawerOperation] = useState<'pullAll' | 'pushAll'>('pullAll');
  const [drawerResults, setDrawerResults] = useState<PullResult[]>([]);
  const [repoLog, setRepoLog] = useState<RepoLog | null>(null);
  const autoScanRunning = useRef(false);

  const applySnapshot = (nextSnapshot: AppSnapshot) => {
    setSnapshot(nextSnapshot);
    setSelectedRepoId(current => nextSnapshot.repoDetails[current] ? current : nextSnapshot.selectedRepoId);
  };

  const refreshSnapshot = async (nextSettings = settings) => {
    applySnapshot(await fetchSnapshot(nextSettings));
  };

  const handleBatch = async (operation: 'pull' | 'push') => {
    const result = await runBatch(operation, settings);
    applySnapshot(result.snapshot);
    setDrawerOperation(result.operation ?? (operation === 'pull' ? 'pullAll' : 'pushAll'));
    setDrawerResults(result.results ?? []);
    setShowPullDrawer(true);
  };

  const handleSaveSettings = (nextSettings: AppSettings) => {
    const sanitized = sanitizeSettings(nextSettings);
    setSettings(sanitized);
    saveSettings(sanitized);
    setShowSettings(false);
    void refreshSnapshot(sanitized);
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
    await refreshSnapshot(nextSettings);
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
    void refreshSnapshot(nextSettings);
  };

  const handleRetryRepo = async (repoId: string, operation: 'pullAll' | 'pushAll') => {
    try {
      const snapshotAfterRetry = await mutateRepo(repoId, operation === 'pullAll' ? 'pull' : 'push', settings);
      applySnapshot(snapshotAfterRetry);
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
    if (!snapshot) return;
    const repo = snapshot.repos.find(item => item.path === path);
    if (!repo) return;
    await invokeLocalRepoAction(repo.id, 'open-folder', settings, path);
  };

  const handleViewRepoLog = async (repoId: string) => {
    const log = await fetchRepoLog(repoId, settings);
    if (log) setRepoLog(log);
  };

  useEffect(() => {
    void refreshSnapshot();
  }, []);

  useEffect(() => {
    if (!settings.gitBehavior.autoScanEnabled) return;
    const timer = window.setInterval(async () => {
      if (autoScanRunning.current) return;
      autoScanRunning.current = true;
      try {
        await refreshSnapshot();
      } finally {
        autoScanRunning.current = false;
      }
    }, settings.gitBehavior.autoScanIntervalSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [settings]);

  if (!snapshot) {
    return (
      <AppFrame>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textWeak, fontSize: 12 }}>
          正在扫描仓库...
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
          selectedRepoId={selectedRepoId}
          onSelectRepo={id => setSelectedRepoId(id)}
          onPullAll={() => void handleBatch('pull')}
          onPushAll={() => void handleBatch('push')}
          onRefresh={() => void refreshSnapshot()}
          onOpenSettings={() => {
            setSettingsTab('git-behavior');
            setShowSettings(true);
          }}
          onOpenAddMenu={() => setShowAddMenu(true)}
          onToggleAutoScan={handleToggleAutoScan}
        />
        <Workspace
          repoDetails={snapshot.repoDetails}
          commitCandidates={snapshot.commitCandidates}
          settings={settings}
          selectedRepoId={selectedRepoId}
          onRefresh={() => void refreshSnapshot()}
          onOpenSettings={() => {
            setSettingsTab('git-behavior');
            setShowSettings(true);
          }}
          onShowLog={log => setRepoLog(log)}
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
        scannedAt={snapshot.scannedAt}
        onClose={() => setShowPullDrawer(false)}
        onOpenRepo={path => void handleOpenRepoFromDrawer(path)}
        onViewLog={repoId => void handleViewRepoLog(repoId)}
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
