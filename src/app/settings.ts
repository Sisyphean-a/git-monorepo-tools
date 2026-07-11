import { cloneDefaultCommandCenter, sanitizeCommandCenter } from './command-center.js';
import type { AppSettings, ScanRootSetting } from './types.js';

const STORAGE_KEY = 'git-manager-ui-settings';

export const DEFAULT_SETTINGS: AppSettings = {
  scanRoots: [],
  customCategories: [],
  aiCommit: {
    apiKey: '',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    maxDiffChars: 8000,
    generateThree: false,
    stagedOnly: true,
    promptTemplate: 'You generate a single Git commit message from repository changes.\n\nRequirements:\n- Output JSON only: {"message":"..."}.\n- The message must be Simplified Chinese.\n- The message must be one line.\n- Prefer Conventional Commits style: type(scope): summary.\n- Keep it specific and concise.\n- Do not mention AI, JSON, prompt, or file counts unless they are essential.\n- If the changes span multiple areas, omit scope instead of guessing.\n- If you cannot infer a precise type, use chore.',
  },
  gitBehavior: {
    autoScanEnabled: true,
    autoScanIntervalSeconds: 60,
    pullStrategy: 'ff-only',
    pushStrategy: 'upstream-only',
    concurrency: 5,
    timeoutSeconds: 60,
    proxy: {
      enabled: false,
      host: '127.0.0.1',
      port: 7897,
    },
  },
  commandCenter: cloneDefaultCommandCenter(),
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

function sanitizePort(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 65535 ? parsed : fallback;
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
  const aiCommit: Partial<AppSettings['aiCommit']> = source.aiCommit ?? {};
  const gitBehavior: Partial<AppSettings['gitBehavior']> = source.gitBehavior ?? {};
  const proxy: Partial<AppSettings['gitBehavior']['proxy']> = gitBehavior.proxy ?? {};

  draft.scanRoots = sanitizeScanRoots(source.scanRoots);
  draft.customCategories = sanitizeCategories(source.customCategories);
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
  draft.gitBehavior.proxy.enabled = sanitizeBoolean(proxy.enabled, draft.gitBehavior.proxy.enabled);
  draft.gitBehavior.proxy.host = sanitizeText(proxy.host, draft.gitBehavior.proxy.host);
  draft.gitBehavior.proxy.port = sanitizePort(proxy.port, draft.gitBehavior.proxy.port);
  draft.commandCenter = sanitizeCommandCenter(source.commandCenter);
  return draft;
}

function sanitizeCategories(value: unknown) {
  if (!Array.isArray(value)) return [];
  const categories = value
    .filter((item): item is string => typeof item === 'string')
    .map(item => item.trim())
    .filter(Boolean);
  return [...new Set(categories)];
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
