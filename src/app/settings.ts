import type { AppSettings, ScanRootSetting } from './types';

const STORAGE_KEY = 'git-manager-ui-settings';

export const DEFAULT_SETTINGS: AppSettings = {
  scanRoots: [],
  customCategories: [],
  aiCommit: {
    apiKey: '',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    maxDiffChars: 8000,
    generateThree: true,
    stagedOnly: true,
    promptTemplate: '你是 Git 提交信息生成器。请分析下面已暂存的 Diff，并生成简洁的提交信息。输出 3 条不同风格的候选，包括表情风格、短句风格和约定式提交风格。',
  },
  gitBehavior: {
    autoScanEnabled: true,
    autoScanIntervalSeconds: 60,
    pullStrategy: 'ff-only',
    pushStrategy: 'upstream-only',
    concurrency: 5,
    timeoutSeconds: 60,
  },
};

function cloneDefaults() {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as AppSettings;
}

function sanitizeText(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function sanitizeBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function sanitizeNumber(value: unknown, fallback: number, allowed: number[]) {
  const parsed = Number(value);
  return allowed.includes(parsed) ? parsed : fallback;
}

function sanitizeScanRoots(value: unknown) {
  if (!Array.isArray(value)) return [] as ScanRootSetting[];
  const seen = new Set<string>();
  const roots: ScanRootSetting[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const path = sanitizeText((item as ScanRootSetting).path, '');
    if (!path) continue;
    const key = path.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    roots.push({
      path,
      category: sanitizeText((item as ScanRootSetting).category, '自定义工作区'),
    });
  }
  return roots;
}

export function sanitizeSettings(value: unknown): AppSettings {
  const draft = cloneDefaults();
  if (!value || typeof value !== 'object') return draft;
  const source = value as Partial<AppSettings>;
  const aiCommit = source.aiCommit ?? {};
  const gitBehavior = source.gitBehavior ?? {};

  draft.scanRoots = sanitizeScanRoots(source.scanRoots);
  draft.customCategories = Array.isArray(source.customCategories)
    ? source.customCategories.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
  draft.aiCommit.apiKey = typeof aiCommit.apiKey === 'string' ? aiCommit.apiKey : draft.aiCommit.apiKey;
  draft.aiCommit.baseUrl = sanitizeText(aiCommit.baseUrl, draft.aiCommit.baseUrl);
  draft.aiCommit.model = sanitizeText(aiCommit.model, draft.aiCommit.model);
  draft.aiCommit.maxDiffChars = sanitizeNumber(aiCommit.maxDiffChars, draft.aiCommit.maxDiffChars, [2000, 4000, 8000, 12000, 20000]);
  draft.aiCommit.generateThree = sanitizeBoolean(aiCommit.generateThree, draft.aiCommit.generateThree);
  draft.aiCommit.stagedOnly = sanitizeBoolean(aiCommit.stagedOnly, draft.aiCommit.stagedOnly);
  draft.aiCommit.promptTemplate = sanitizeText(aiCommit.promptTemplate, draft.aiCommit.promptTemplate);

  draft.gitBehavior.autoScanEnabled = sanitizeBoolean(gitBehavior.autoScanEnabled, draft.gitBehavior.autoScanEnabled);
  draft.gitBehavior.autoScanIntervalSeconds = sanitizeNumber(gitBehavior.autoScanIntervalSeconds, draft.gitBehavior.autoScanIntervalSeconds, [30, 60, 120, 300]);
  draft.gitBehavior.pullStrategy = ['ff-only', 'rebase', 'merge'].includes(gitBehavior.pullStrategy ?? '')
    ? (gitBehavior.pullStrategy as AppSettings['gitBehavior']['pullStrategy'])
    : draft.gitBehavior.pullStrategy;
  draft.gitBehavior.pushStrategy = ['upstream-only', 'all'].includes(gitBehavior.pushStrategy ?? '')
    ? (gitBehavior.pushStrategy as AppSettings['gitBehavior']['pushStrategy'])
    : draft.gitBehavior.pushStrategy;
  draft.gitBehavior.concurrency = sanitizeNumber(gitBehavior.concurrency, draft.gitBehavior.concurrency, [1, 2, 3, 5]);
  draft.gitBehavior.timeoutSeconds = sanitizeNumber(gitBehavior.timeoutSeconds, draft.gitBehavior.timeoutSeconds, [30, 60, 120]);
  return draft;
}

export function loadSettings() {
  if (typeof window === 'undefined') return cloneDefaults();
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return cloneDefaults();
  try {
    return sanitizeSettings(JSON.parse(raw));
  } catch {
    return cloneDefaults();
  }
}

export function saveSettings(settings: AppSettings) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizeSettings(settings)));
}

export function formatAutoScanLabel(settings: AppSettings) {
  if (!settings.gitBehavior.autoScanEnabled) return '自动扫描：关闭';
  return `自动扫描：${settings.gitBehavior.autoScanIntervalSeconds} 秒`;
}
