import type { Dispatch, SetStateAction } from 'react';
import type { AppSettings, AppSnapshot } from '../domain/types.js';
import type { SettingsStore, WorkspaceBackend } from './ports.js';

interface SettingsActionContext {
  backend: Pick<WorkspaceBackend, 'pickFolder'>;
  settingsStore: SettingsStore;
  settings: AppSettings;
  setSettings: Dispatch<SetStateAction<AppSettings>>;
  snapshot: AppSnapshot | null;
  refreshSnapshot: (settings: AppSettings) => Promise<void>;
  reportError: (error: unknown, fallback: string) => void;
}

export function createSettingsActions(context: SettingsActionContext) {
  return {
    saveSettings: (value: AppSettings) => saveSettings(context, value),
    toggleAutoScan: () => toggleAutoScan(context),
    addScanRoot: () => addScanRoot(context),
    addCategory: (name: string) => addCategory(context, name),
    removeScanRoot: (path: string) => removeScanRoot(context, path),
  };
}

function persistSettings(context: SettingsActionContext, value: unknown) {
  const next = context.settingsStore.sanitizeSettings(value);
  context.setSettings(next);
  context.settingsStore.saveSettings(next);
  return next;
}

function saveSettings(context: SettingsActionContext, value: AppSettings) {
  const next = persistSettings(context, value);
  void context.refreshSnapshot(next).catch(error => context.reportError(error, '刷新设置失败'));
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
  try {
    const folder = await context.backend.pickFolder();
    if (!folder || hasScanRoot(context.settings, folder)) return false;
    const rootName = folder.split('/').at(-1) ?? '自定义工作区';
    const next = persistSettings(context, {
      ...context.settings,
      scanRoots: [...context.settings.scanRoots, { path: folder, category: `${rootName} 工作区` }],
    });
    await context.refreshSnapshot(next);
    return true;
  } catch (error) {
    context.reportError(error, '添加目录失败');
    return false;
  }
}

function addCategory(context: SettingsActionContext, name: string) {
  const category = name.trim();
  if (!category || hasCategory(context.settings, context.snapshot, category)) return false;
  persistSettings(context, {
    ...context.settings,
    customCategories: [...context.settings.customCategories, category],
  });
  return true;
}

function removeScanRoot(context: SettingsActionContext, path: string) {
  const next = persistSettings(context, {
    ...context.settings,
    scanRoots: context.settings.scanRoots.filter(item => item.path !== path),
  });
  void context.refreshSnapshot(next).catch(error => context.reportError(error, '移除目录后刷新失败'));
}

function hasScanRoot(settings: AppSettings, path: string) {
  return settings.scanRoots.some(item => item.path.toLowerCase() === path.toLowerCase());
}

function hasCategory(settings: AppSettings, snapshot: AppSnapshot | null, category: string) {
  return settings.customCategories.includes(category) || Boolean(snapshot?.categories.includes(category));
}
