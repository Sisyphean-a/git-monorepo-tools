import type { Dispatch, SetStateAction } from 'react';
import type { AppSettings, AppSnapshot } from '../domain/types.js';
import type { SettingsStore, SnapshotFetchOptions, WorkspaceBackend } from './ports.js';

interface SettingsActionContext {
  backend: Pick<WorkspaceBackend, 'pickFolder'>;
  settingsStore: SettingsStore;
  settings: AppSettings;
  setSettings: Dispatch<SetStateAction<AppSettings>>;
  snapshot: AppSnapshot | null;
  refreshSnapshot: (settings: AppSettings, options?: SnapshotFetchOptions) => Promise<void>;
  reportError: (error: unknown, fallback: string) => void;
}

export function createSettingsActions(context: SettingsActionContext) {
  return {
    saveSettings: (value: AppSettings) => saveSettings(context, value),
    setFileTreeWidth: (repoId: string, width: number) => setFileTreeWidth(context, repoId, width),
    toggleAutoScan: () => toggleAutoScan(context),
    addScanRoot: () => addScanRoot(context),
    addCategory: (name: string) => addCategory(context, name),
    removeScanRoot: (path: string) => removeScanRoot(context, path),
    ignoreRepo: (path: string) => ignoreRepo(context, path),
    unignoreRepo: (path: string) => unignoreRepo(context, path),
  };
}

export function withScanRoots(settings: AppSettings, scanRoots: AppSettings['scanRoots']) {
  return { ...settings, scanRoots };
}

function persistSettings(context: SettingsActionContext, value: unknown) {
  const next = context.settingsStore.sanitizeSettings(value);
  context.setSettings(next);
  context.settingsStore.saveSettings(next);
  return next;
}

function saveSettings(context: SettingsActionContext, value: AppSettings) {
  const next = persistSettings(context, value);
  void context.refreshSnapshot(next, { refreshRemotes: false }).catch(error => context.reportError(error, '刷新设置失败'));
}

function setFileTreeWidth(context: SettingsActionContext, repoId: string, width: number) {
  // Rule: 纯界面偏好只更新本地设置，不触发仓库重新扫描或远端刷新。
  return persistSettings(context, {
    ...context.settings,
    fileTreeWidths: { ...context.settings.fileTreeWidths, [repoId]: width },
  });
}

function toggleAutoScan(context: SettingsActionContext) {
  return persistSettings(context, {
    ...context.settings,
    gitBehavior: {
      ...context.settings.gitBehavior,
      autoScanEnabled: !context.settings.gitBehavior.autoScanEnabled,
    },
  });
}

async function addScanRoot(context: SettingsActionContext) {
  let folder: string | null;
  try {
    folder = await context.backend.pickFolder();
  } catch (error) {
    context.reportError(error, '打开目录选择器失败');
    return null;
  }
  if (!folder || hasScanRoot(context.settings, folder)) return null;
  const rootName = folder.split(/[\\/]/).filter(Boolean).at(-1) ?? '自定义工作区';
  const next = persistSettings(context, {
    ...context.settings,
    scanRoots: [...context.settings.scanRoots, { path: folder, category: `${rootName} 工作区` }],
  });
  // Guarantee: 目录一旦持久化就返回 next，即使刷新失败也让设置弹窗草稿同步，避免后续保存覆盖新目录。
  try {
    await context.refreshSnapshot(next, { refreshRemotes: false });
  } catch (error) {
    context.reportError(error, '目录已添加，但刷新失败');
  }
  return next;
}

function addCategory(context: SettingsActionContext, name: string) {
  const category = name.trim();
  if (!category || hasCategory(context.settings, context.snapshot, category)) return null;
  return persistSettings(context, {
    ...context.settings,
    customCategories: [...context.settings.customCategories, category],
  });
}

function removeScanRoot(context: SettingsActionContext, path: string) {
  const next = persistSettings(context, {
    ...context.settings,
    scanRoots: context.settings.scanRoots.filter(item => item.path !== path),
  });
  void context.refreshSnapshot(next, { refreshRemotes: false }).catch(error => context.reportError(error, '移除目录后刷新失败'));
  return next;
}

function ignoreRepo(context: SettingsActionContext, path: string) {
  const next = persistSettings(context, {
    ...context.settings,
    ignoredRepoPaths: [...context.settings.ignoredRepoPaths, path],
  });
  void context.refreshSnapshot(next, { refreshRemotes: false }).catch(error => context.reportError(error, '忽略项目后刷新失败'));
  return next;
}

function unignoreRepo(context: SettingsActionContext, path: string) {
  const next = persistSettings(context, {
    ...context.settings,
    ignoredRepoPaths: context.settings.ignoredRepoPaths.filter(item => item.toLowerCase() !== path.toLowerCase()),
  });
  void context.refreshSnapshot(next, { refreshRemotes: false }).catch(error => context.reportError(error, '恢复项目监控后刷新失败'));
  return next;
}

function hasScanRoot(settings: AppSettings, path: string) {
  return settings.scanRoots.some(item => item.path.toLowerCase() === path.toLowerCase());
}

function hasCategory(settings: AppSettings, snapshot: AppSnapshot | null, category: string) {
  return settings.customCategories.includes(category) || Boolean(snapshot?.categories.includes(category));
}
