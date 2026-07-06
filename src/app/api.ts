import type { AppSettings, AppSnapshot, PullResult, RepoCommandResult, RepoLog, RepoMutationAction, TerminalSessionInfo } from './types.js';

interface SnapshotRequest {
  scanRoots: AppSettings['scanRoots'];
  concurrency: AppSettings['gitBehavior']['concurrency'];
  pullStrategy: AppSettings['gitBehavior']['pullStrategy'];
  pushStrategy: AppSettings['gitBehavior']['pushStrategy'];
  refreshRemotes: boolean;
}

interface SnapshotResponse {
  snapshot: AppSnapshot;
  results?: PullResult[];
  operation?: 'pullAll' | 'pushAll';
  log?: RepoLog;
  path?: string | null;
  error?: string;
}

type WailsSnapshotBinding = (request: SnapshotRequest) => Promise<AppSnapshot>;
export type SnapshotFetchOptions = {
  refreshRemotes?: boolean;
};
type WailsRepoActionRequest = {
	fileId?: string;
	filePath?: string;
	message?: string;
	repoPath?: string;
};
type WailsRepoCommandRequest = {
  repoPath: string;
  command: string;
  streamId?: string;
};
type WailsTerminalSessionRequest = {
  repoId: string;
  repoPath: string;
  cols?: number;
  rows?: number;
};

type WailsBindings = {
  GetSnapshot: WailsSnapshotBinding;
  MutateRepo: (repoId: string, action: string, request: SnapshotRequest, body: WailsRepoActionRequest) => Promise<AppSnapshot>;
  RunBatch: (operation: 'pull' | 'push', request: SnapshotRequest) => Promise<SnapshotResponse>;
  GetRepoLog: (repoId: string, request: SnapshotRequest) => Promise<RepoLog>;
  RunRepoCommand: (request: WailsRepoCommandRequest) => Promise<RepoCommandResult>;
  EnsureTerminalSession: (request: WailsTerminalSessionRequest) => Promise<TerminalSessionInfo>;
  RestartTerminalSession: (sessionId: string, cols: number, rows: number) => Promise<TerminalSessionInfo>;
  WriteTerminalInput: (sessionId: string, data: string) => Promise<void>;
  ResizeTerminal: (sessionId: string, cols: number, rows: number) => Promise<void>;
  GenerateCommitMessage: (
    repoId: string,
    request: SnapshotRequest,
    aiCommit: AppSettings['aiCommit'],
  ) => Promise<string>;
  OpenFolder: (path: string) => Promise<void>;
  OpenTerminal: (path: string) => Promise<void>;
  OpenConflicts: (path: string) => Promise<void>;
  PickFolder: () => Promise<string>;
};

const WAILS_REPO_ACTIONS = new Set<RepoMutationAction>([
  'stage-all',
  'unstage-all',
  'stage-file',
  'unstage-file',
  'commit',
  'pull',
  'push',
  'discard-all',
]);

function buildSnapshotRequest(settings?: AppSettings, options?: SnapshotFetchOptions): SnapshotRequest {
  return {
    scanRoots: settings?.scanRoots ?? [],
    concurrency: settings?.gitBehavior.concurrency ?? 5,
    pullStrategy: settings?.gitBehavior.pullStrategy ?? 'ff-only',
    pushStrategy: settings?.gitBehavior.pushStrategy ?? 'upstream-only',
    refreshRemotes: options?.refreshRemotes ?? false,
  };
}

function getWailsBindings(): WailsBindings {
  if (typeof window === 'undefined') {
    throw new Error('当前环境不支持 Wails 绑定');
  }
  const binding = window.go?.main?.App as Partial<WailsBindings> | undefined;
  if (!binding) {
    throw new Error('Wails 绑定不可用');
  }
  if (
    typeof binding.GetSnapshot !== 'function'
    || typeof binding.MutateRepo !== 'function'
    || typeof binding.RunBatch !== 'function'
    || typeof binding.GetRepoLog !== 'function'
    || typeof binding.RunRepoCommand !== 'function'
    || typeof binding.EnsureTerminalSession !== 'function'
    || typeof binding.RestartTerminalSession !== 'function'
    || typeof binding.WriteTerminalInput !== 'function'
    || typeof binding.ResizeTerminal !== 'function'
    || typeof binding.GenerateCommitMessage !== 'function'
    || typeof binding.OpenFolder !== 'function'
    || typeof binding.OpenTerminal !== 'function'
    || typeof binding.OpenConflicts !== 'function'
    || typeof binding.PickFolder !== 'function'
  ) {
    throw new Error('Wails 绑定不完整');
  }
  return binding as WailsBindings;
}

export async function fetchSnapshot(settings?: AppSettings, options?: SnapshotFetchOptions) {
  return getWailsBindings().GetSnapshot(buildSnapshotRequest(settings, options));
}

export async function mutateRepo(repoId: string, action: RepoMutationAction, settings?: AppSettings, body?: Record<string, unknown>) {
  const binding = getWailsBindings();
  if (!WAILS_REPO_ACTIONS.has(action)) {
    throw new Error(`未迁移的仓库动作：${action}`);
  }
  return binding.MutateRepo(repoId, action, buildSnapshotRequest(settings), (body ?? {}) as WailsRepoActionRequest);
}

export async function runBatch(operation: 'pull' | 'push', settings?: AppSettings) {
  return getWailsBindings().RunBatch(operation, buildSnapshotRequest(settings));
}

export async function fetchRepoLog(repoId: string, settings: AppSettings) {
  return getWailsBindings().GetRepoLog(repoId, buildSnapshotRequest(settings));
}

export async function runRepoCommand(repoPath: string, command: string, streamId?: string) {
  return getWailsBindings().RunRepoCommand({ repoPath, command, streamId });
}

export async function ensureTerminalSession(repoId: string, repoPath: string, cols?: number, rows?: number) {
  return getWailsBindings().EnsureTerminalSession({ repoId, repoPath, cols, rows });
}

export async function restartTerminalSession(sessionId: string, cols: number, rows: number) {
  return getWailsBindings().RestartTerminalSession(sessionId, cols, rows);
}

export async function writeTerminalInput(sessionId: string, data: string) {
  return getWailsBindings().WriteTerminalInput(sessionId, data);
}

export async function resizeTerminal(sessionId: string, cols: number, rows: number) {
  return getWailsBindings().ResizeTerminal(sessionId, cols, rows);
}

export async function invokeLocalRepoAction(action: 'open-folder' | 'open-terminal' | 'open-conflicts', path: string) {
  const binding = getWailsBindings();
  if (action === 'open-folder') {
    return binding.OpenFolder(path);
  }
  if (action === 'open-terminal') {
    return binding.OpenTerminal(path);
  }
  return binding.OpenConflicts(path);
}

export async function generateCommitMessage(repoId: string, settings: AppSettings) {
  return getWailsBindings().GenerateCommitMessage(repoId, buildSnapshotRequest(settings), settings.aiCommit);
}

export async function pickFolder() {
  const path = await getWailsBindings().PickFolder();
  return path || null;
}
