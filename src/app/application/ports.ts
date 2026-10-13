import type {
  AppSettings,
  AppSnapshot,
  CommitDetail,
  FileChange,
  FileDiff,
  PullResult,
  RepoCommandResult,
  RepoFileContent,
  RepoHistoryPage,
  RepoLog,
  RepoMutationAction,
  RepoTreeEntry,
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
  setReadActivity(repoId: string, fileBrowserActive: boolean): Promise<void>;
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
  stopRepoCommand(streamId: string): Promise<void>;
  invokeLocalRepoAction(action: LocalRepoAction, path: string): Promise<void>;
  openLocalPath(path: string): Promise<void>;
  revealInExplorer(path: string): Promise<void>;
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

export interface RepoFileRequest {
  repoId: string;
  path: string;
  settings?: AppSettings;
  target?: RepoRefreshTarget;
}

export interface WorkingDiffFilesRequest {
  repoId: string;
  settings?: AppSettings;
  target?: RepoRefreshTarget;
}

export interface FileDiffRequest {
  repoId: string;
  filePath: string;
  previousPath?: string;
  status: FileChange['status'];
  staged: boolean;
  untracked: boolean;
  commitHash?: string;
  parentHash?: string;
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
  listRepoDirectory(request: RepoFileRequest): Promise<RepoTreeEntry[]>;
  readRepoFile(request: RepoFileRequest): Promise<RepoFileContent>;
  readRepoFileIfChanged(request: RepoFileRequest, revision: string): Promise<RepoFileContent | null>;
  fetchWorkingDiffFiles(request: WorkingDiffFilesRequest): Promise<FileChange[]>;
  fetchFileDiff(request: FileDiffRequest): Promise<FileDiff>;
  generateCommitMessage(repoId: string, settings: AppSettings): Promise<string>;
  ensureTerminalSession(request: TerminalSessionRequest): Promise<TerminalSessionInfo>;
  createTerminalSession(request: TerminalSessionRequest): Promise<TerminalSessionInfo>;
  restartTerminalSession(sessionId: string, cols: number, rows: number): Promise<TerminalSessionInfo>;
  closeTerminalSession(sessionId: string): Promise<void>;
  writeTerminalInput(sessionId: string, data: string): Promise<void>;
  resizeTerminal(sessionId: string, cols: number, rows: number): Promise<void>;
}

export type RuntimeEventHandler = (payload: unknown) => void;

export interface RuntimeBackend {
  onEvent(event: string, handler: RuntimeEventHandler): () => void;
  readClipboardImagePath(): Promise<string | null>;
  readClipboardText(): Promise<string>;
  openExternalURL(url: string): void;
}

export interface ResourceMonitorBackend {
  fetchResourceMonitorState(): Promise<import('../domain/resource-monitor.js').ResourceMonitorState>;
}

export interface BackgroundTaskBackend {
  listBackgroundTasks(): Promise<import('../domain/background-task.js').BackgroundTaskState[]>;
  startBackgroundTask(request: import('../domain/background-task.js').BackgroundTaskRequest): Promise<import('../domain/background-task.js').BackgroundTaskState>;
  stopBackgroundTask(repoId: string, taskId: string): Promise<void>;
  readBackgroundTaskLog(repoId: string, taskId: string, runId: number, cursor: number): Promise<import('../domain/background-task.js').BackgroundTaskLog>;
  forgetBackgroundTask(repoId: string, taskId: string): Promise<void>;
}

export type AppBackend = WorkspaceBackend & RepoInteractionBackend & RuntimeBackend & ResourceMonitorBackend & BackgroundTaskBackend;

export interface SettingsStore {
  loadSettings(): AppSettings;
  saveSettings(settings: AppSettings): void;
  sanitizeSettings(value: unknown): AppSettings;
}

export type LocalRepoAction = 'open-folder' | 'open-terminal' | 'open-conflicts';
