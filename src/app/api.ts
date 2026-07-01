import { INITIAL_SNAPSHOT } from './data';
import type { AICommitPreview, AppSettings, AppSnapshot, CommitCandidate, PullResult, RepoLog } from './types';

interface SnapshotRequest {
  scanRoots: AppSettings['scanRoots'];
  pullStrategy: AppSettings['gitBehavior']['pullStrategy'];
  pushStrategy: AppSettings['gitBehavior']['pushStrategy'];
}

interface SnapshotResponse {
  snapshot: AppSnapshot;
  results?: PullResult[];
  operation?: 'pullAll' | 'pushAll';
  log?: RepoLog;
  candidates?: CommitCandidate[];
  path?: string | null;
  error?: string;
}

type WailsSnapshotBinding = (request: SnapshotRequest) => Promise<AppSnapshot>;
type WailsRepoActionRequest = {
  fileId?: string;
  filePath?: string;
  message?: string;
};

type WailsBindings = {
  GetSnapshot: WailsSnapshotBinding;
  MutateRepo: (repoId: string, action: string, request: SnapshotRequest, body: WailsRepoActionRequest) => Promise<AppSnapshot>;
  RunBatch: (operation: 'pull' | 'push', request: SnapshotRequest) => Promise<SnapshotResponse>;
  GetRepoLog: (repoId: string, request: SnapshotRequest) => Promise<RepoLog>;
  GenerateCommitCandidates: (
    repoId: string,
    request: SnapshotRequest,
    aiCommit: AppSettings['aiCommit'],
    styleHint?: string,
  ) => Promise<CommitCandidate[]>;
  OpenFolder: (path: string) => Promise<void>;
  OpenTerminal: (path: string) => Promise<void>;
  OpenConflicts: (path: string) => Promise<void>;
  PickFolder: () => Promise<string>;
};

const WAILS_REPO_ACTIONS = new Set([
  'stage-all',
  'unstage-all',
  'stage-file',
  'unstage-file',
  'commit',
  'pull',
  'push',
]);

export function getInitialSnapshot() {
  return INITIAL_SNAPSHOT;
}

function buildSnapshotRequest(settings?: AppSettings): SnapshotRequest {
  return {
    scanRoots: settings?.scanRoots ?? [],
    pullStrategy: settings?.gitBehavior.pullStrategy ?? 'ff-only',
    pushStrategy: settings?.gitBehavior.pushStrategy ?? 'upstream-only',
  };
}

function getWailsBindings(): WailsBindings {
  if (typeof window === 'undefined') {
    throw new Error('当前环境不支持 Wails 绑定');
  }
  const binding = window.go?.main?.App;
  if (!binding) {
    throw new Error('Wails 绑定不可用');
  }
  if (
    typeof binding.GetSnapshot !== 'function'
    || typeof binding.MutateRepo !== 'function'
    || typeof binding.RunBatch !== 'function'
    || typeof binding.GetRepoLog !== 'function'
    || typeof binding.GenerateCommitCandidates !== 'function'
    || typeof binding.OpenFolder !== 'function'
    || typeof binding.OpenTerminal !== 'function'
    || typeof binding.OpenConflicts !== 'function'
    || typeof binding.PickFolder !== 'function'
  ) {
    throw new Error('Wails 绑定不完整');
  }
  return binding;
}

export async function fetchSnapshot(settings?: AppSettings) {
  return getWailsBindings().GetSnapshot(buildSnapshotRequest(settings));
}

export async function mutateRepo(repoId: string, action: string, settings?: AppSettings, body?: Record<string, unknown>) {
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

export async function invokeLocalRepoAction(repoId: string, action: 'open-folder' | 'open-terminal' | 'open-conflicts', settings: AppSettings, path: string) {
  const binding = getWailsBindings();
  if (action === 'open-folder') {
    await binding.OpenFolder(path);
    return fetchSnapshot(settings);
  }
  if (action === 'open-terminal') {
    await binding.OpenTerminal(path);
    return fetchSnapshot(settings);
  }
  await binding.OpenConflicts(path);
  return fetchSnapshot(settings);
}

export async function generateCommitCandidates(repoId: string, settings: AppSettings, styleHint?: string): Promise<AICommitPreview> {
  return {
    candidates: await getWailsBindings().GenerateCommitCandidates(repoId, buildSnapshotRequest(settings), settings.aiCommit, styleHint),
  };
}

export async function pickFolder() {
  const path = await getWailsBindings().PickFolder();
  return path || null;
}
