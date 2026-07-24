import type {
  AppSettings,
  AppSnapshot,
  CommitDetail,
  FileDiff,
  PullResult,
  RepoCommandResult,
  RepoHistoryPage,
  RepoLog,
  RepoMutationAction,
  RepoSnapshotUpdate,
  TerminalSessionInfo,
  WorkspaceBootstrap,
} from '../domain/types.js';

export type SnapshotFetchOptions = {
  refreshRemotes?: boolean;
};

export type RepoRefreshTarget = {
  path: string;
  category: string;
};

export interface BatchResponse {
  updates?: RepoSnapshotUpdate[];
  results?: PullResult[];
  operation?: 'pullAll' | 'pushAll';
  scannedAt: string;
}

export interface WorkspaceBackend {
  fetchWorkspaceBootstrap(settings?: AppSettings): Promise<WorkspaceBootstrap>;
  fetchSnapshot(settings?: AppSettings, options?: SnapshotFetchOptions): Promise<AppSnapshot>;
  refreshRepo(
    repoId: string,
    settings?: AppSettings,
    options?: SnapshotFetchOptions,
    target?: RepoRefreshTarget,
  ): Promise<RepoSnapshotUpdate>;
  mutateRepo(
    repoId: string,
    action: RepoMutationAction,
    settings?: AppSettings,
    body?: Record<string, unknown>,
  ): Promise<RepoSnapshotUpdate>;
  runBatch(operation: 'pull' | 'push', settings?: AppSettings): Promise<BatchResponse>;
  fetchRepoLog(repoId: string, settings: AppSettings): Promise<RepoLog>;
  runRepoCommand(request: RepoCommandRequest): Promise<RepoCommandResult>;
  invokeLocalRepoAction(action: LocalRepoAction, path: string): Promise<void>;
  pickFolder(): Promise<string | null>;
}

export interface RepoHistoryRequest {
  repoId: string;
  offset: number;
  limit: number;
  settings?: AppSettings;
}

export interface CommitDetailRequest {
  repoId: string;
  hash: string;
  settings?: AppSettings;
}

export interface FileDiffRequest {
  repoId: string;
  filePath: string;
  staged: boolean;
  settings?: AppSettings;
  target?: RepoRefreshTarget;
}

export interface RepoCommandRequest {
  repoPath: string;
  command: string;
  streamId?: string;
  settings?: AppSettings;
}

export interface TerminalSessionRequest {
  repoId: string;
  repoPath: string;
  cols?: number;
  rows?: number;
}

export interface RepoInteractionBackend {
  fetchRepoHistory(request: RepoHistoryRequest): Promise<RepoHistoryPage>;
  fetchCommitDetail(request: CommitDetailRequest): Promise<CommitDetail>;
  fetchFileDiff(request: FileDiffRequest): Promise<FileDiff>;
  generateCommitMessage(repoId: string, settings: AppSettings): Promise<string>;
  ensureTerminalSession(request: TerminalSessionRequest): Promise<TerminalSessionInfo>;
  restartTerminalSession(sessionId: string, cols: number, rows: number): Promise<TerminalSessionInfo>;
  writeTerminalInput(sessionId: string, data: string): Promise<void>;
  resizeTerminal(sessionId: string, cols: number, rows: number): Promise<void>;
}

export type RuntimeEventHandler = (payload: unknown) => void;

export interface RuntimeBackend {
  onEvent(event: string, handler: RuntimeEventHandler): () => void;
  readClipboardImagePath(): Promise<string | null>;
  readClipboardText(): Promise<string>;
}

export type AppBackend = WorkspaceBackend & RepoInteractionBackend & RuntimeBackend;

export interface SettingsStore {
  loadSettings(): AppSettings;
  saveSettings(settings: AppSettings): void;
  sanitizeSettings(value: unknown): AppSettings;
}

export type LocalRepoAction = 'open-folder' | 'open-terminal' | 'open-conflicts';
