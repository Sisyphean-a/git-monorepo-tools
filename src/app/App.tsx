import { useState } from 'react';
import { AddRepoMenu } from './components/add-repo-menu';
import { AppFrame } from './components/common';
import { LogViewerModal } from './components/log-viewer-modal';
import { PullAllDrawer } from './components/pull-all-drawer';
import { SettingsModal } from './components/settings-modal';
import { Sidebar } from './components/sidebar';
import { Workspace } from './components/workspace';
import { BackendProvider } from './application/backend-context';
import { useBatchController } from './application/use-batch-controller';
import { useWorkspaceController } from './application/use-workspace-controller';
import type { SettingsTab } from './domain/types';
import { settingsStore } from './infrastructure/settings-store';
import { wailsAppBackend } from './infrastructure/wails-app-backend';
import { C } from './theme';

type WorkspaceController = ReturnType<typeof useWorkspaceController>;
type BatchController = ReturnType<typeof useBatchController>;
type DialogController = ReturnType<typeof useDialogs>;

export default function App() {
  const dialogs = useDialogs();
  const workspace = useWorkspaceController({ backend: wailsAppBackend, settingsStore });
  const batch = useBatchController({
    backend: wailsAppBackend,
    settings: workspace.settings,
    runQueuedTask: workspace.runQueuedTask,
    applyRepoUpdate: workspace.applyRepoUpdate,
    mutateRepo: workspace.mutateRepo,
    openRepo: path => workspace.invokeLocalRepoAction('open-folder', path),
    openRepoLog: workspace.openRepoLog,
    reportError: workspace.reportActionError,
  });

  if (!workspace.snapshot) {
    return <LoadingState error={workspace.visibleError} onRetry={workspace.retryStartupScan} />;
  }

  return (
    <BackendProvider backend={wailsAppBackend}>
      <AppFrame>
        <WorkspaceLayout workspace={workspace} batch={batch} dialogs={dialogs} />
        <AppDialogs workspace={workspace} batch={batch} dialogs={dialogs} />
      </AppFrame>
    </BackendProvider>
  );
}

function WorkspaceLayout({
  workspace,
  batch,
  dialogs,
}: {
  workspace: WorkspaceController;
  batch: BatchController;
  dialogs: DialogController;
}) {
  const snapshot = workspace.snapshot!;
  const sidebar = workspace.sidebar.sidebarSnapshot ?? {
    scannedAt: snapshot.scannedAt,
    categories: snapshot.categories,
    repos: snapshot.repos,
  };

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      <Sidebar
        repos={sidebar.repos}
        categories={mergeCategories(sidebar.categories, workspace.settings.customCategories)}
        scannedAt={sidebar.scannedAt}
        settings={workspace.settings}
        batchAction={batch.activeAction}
        isRefreshing={workspace.sidebar.sidebarRefreshing}
        recentError={workspace.visibleError}
        selectedRepoId={workspace.selectedRepoId}
        onSelectRepo={workspace.setSelectedRepoId}
        onPullAll={() => void batch.runBatch('pull')}
        onPushAll={() => void batch.runBatch('push')}
        onRefresh={() => void workspace.sidebar.refreshSidebar()}
        onOpenAddMenu={dialogs.openAddMenu}
        onToggleAutoScan={workspace.toggleAutoScan}
      />
      <Workspace
        repoDetails={snapshot.repoDetails}
        settings={workspace.settings}
        selectedRepoId={workspace.selectedRepoId}
        onRefresh={async repoId => { await workspace.refreshWorkspace(repoId); }}
        onMutateRepo={async (repoId, action, body) => { await workspace.mutateRepo(repoId, action, body); }}
        onInvokeLocalRepoAction={workspace.invokeLocalRepoAction}
        onRunCustomCommand={workspace.runRepoCommand}
        onOpenSettings={dialogs.openSettings}
        onViewLog={workspace.openRepoLog}
        onError={workspace.reportActionError}
      />
    </div>
  );
}

function AppDialogs({
  workspace,
  batch,
  dialogs,
}: {
  workspace: WorkspaceController;
  batch: BatchController;
  dialogs: DialogController;
}) {
  const snapshot = workspace.snapshot!;
  const addFolder = async () => {
    if (await workspace.addScanRoot()) dialogs.closeAddMenu();
  };
  const addCategory = () => {
    const name = window.prompt('输入新分类名称');
    if (name && workspace.addCategory(name)) dialogs.closeAddMenu();
  };

  return (
    <>
      <AddRepoMenu open={dialogs.addMenuOpen} onClose={dialogs.closeAddMenu} onAddFolder={() => void addFolder()} onAddCategory={addCategory} />
      <PullAllDrawer
        open={batch.open}
        operation={batch.operation}
        results={batch.results}
        scannedAt={batch.scannedAt || snapshot.scannedAt}
        onClose={batch.close}
        onOpenRepo={path => void batch.openRepo(path).catch(error => workspace.reportActionError(error, '打开目录失败'))}
        onViewLog={repoId => void batch.openRepoLog(repoId).catch(error => workspace.reportActionError(error, '查看日志失败'))}
        onRetry={(repoId, operation) => void batch.retryRepo(repoId, operation)}
      />
      <SettingsModal
        repos={snapshot.repos}
        settings={workspace.settings}
        open={dialogs.settingsOpen}
        initialTab={dialogs.settingsTab}
        onClose={dialogs.closeSettings}
        onSave={settings => {
          workspace.saveSettings(settings);
          dialogs.closeSettings();
        }}
        onAddScanRoot={async () => { await workspace.addScanRoot(); }}
        onAddCategory={addCategory}
        onRemoveScanRoot={workspace.removeScanRoot}
      />
      <LogViewerModal log={workspace.repoLog} onClose={workspace.closeRepoLog} />
    </>
  );
}

function LoadingState({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return (
    <AppFrame>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: C.textWeak, fontSize: 12, gap: 10 }}>
        <div>{error ? `扫描失败：${error}` : '正在扫描仓库...'}</div>
        {error && (
          <button onClick={onRetry} style={{ background: C.panel2, color: C.textSecondary, border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 12 }}>
            重试扫描
          </button>
        )}
      </div>
    </AppFrame>
  );
}

function useDialogs() {
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('ai-commit');
  return {
    addMenuOpen,
    openAddMenu: () => setAddMenuOpen(true),
    closeAddMenu: () => setAddMenuOpen(false),
    settingsOpen,
    settingsTab,
    openSettings: (tab: SettingsTab = 'git-behavior') => {
      setSettingsTab(tab);
      setSettingsOpen(true);
    },
    closeSettings: () => setSettingsOpen(false),
  };
}

function mergeCategories(base: string[], custom: string[]) {
  return [...base, ...custom.filter(category => !base.includes(category))];
}
