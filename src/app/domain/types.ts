export type RepoStatus = 'clean' | 'changed' | 'conflict' | 'checking' | 'error';
export type FileStatus = 'A' | 'M' | 'D' | 'R';
export type RepoMutationAction = 'stage-all' | 'unstage-all' | 'stage-file' | 'unstage-file' | 'commit' | 'pull' | 'push' | 'discard-all';
export type BuiltInCommandAction = 'stage-all' | 'unstage-all' | 'generate' | 'commit' | 'pull' | 'push' | 'refresh';

export interface RemoteCheck {
  status: 'success' | 'error';
  checkedAt: string;
  error?: string;
}

export interface Repo {
  id: string;
  name: string;
  branch: string;
  headRevision?: string;
  refsRevision?: string;
  path: string;
  remote: string;
  category: string;
  modified: number;
  ahead: number;
  behind: number;
  conflicts: number;
  status: RepoStatus;
  scanError?: string;
  lastScan: string;
  remoteCheck?: RemoteCheck;
}

export interface FileChange {
  id: string;
  status: FileStatus;
  path: string;
  additions: number;
  deletions: number;
  size: string;
  previousPath?: string;
  sizeBytes?: number;
  previousSize?: string;
  previousSizeBytes?: number;
  staged: boolean;
  untracked?: boolean;
}

export interface FileDiff {
  repoId: string;
  path: string;
  staged: boolean;
  content: string;
}

export interface RepoTreeEntry {
  name: string;
  path: string;
  isDir: boolean;
}

export interface RepoFileContent {
  path: string;
  content: string;
  size: number;
  revision: string;
}

export type DiffViewerRequest =
  | { kind: 'working'; repoId: string }
  | { kind: 'commit'; repoId: string; commitHash: string; commitDetail?: CommitDetail };

export interface PullResult {
  id: string;
  name: string;
  path: string;
  result: 'pulled' | 'pushed' | 'skipped' | 'failed' | 'uptodate';
  detail: string;
  commits?: number;
  remoteCheck?: RemoteCheck;
}

export interface ScanRootSetting {
  path: string;
  category: string;
}

export interface AICommitSettings {
  apiKey: string;
  baseUrl: string;
  model: string;
  maxDiffChars: number;
  stagedOnly: boolean;
}

export interface GitProxySettings {
  enabled: boolean;
  host: string;
  port: number;
}

export type PullStrategy = 'ff-only' | 'rebase' | 'merge';
export type PushStrategy = 'upstream-only' | 'all';

export interface GitBehaviorSettings {
  autoScanEnabled: boolean;
  autoScanIntervalSeconds: number;
  pullStrategy: PullStrategy;
  pushStrategy: PushStrategy;
  concurrency: number;
  timeoutSeconds: number;
  proxy: GitProxySettings;
}

export interface CommandCombo {
  id: string;
  label: string;
  actions: BuiltInCommandAction[];
}

export interface CustomCommandButton {
  id: string;
  label: string;
  command: string;
}

export interface CommandCenterSettings {
  combos: CommandCombo[];
  customCommands: CustomCommandButton[];
  projectCommands: Record<string, CustomCommandButton[]>;
}

export interface TerminalOperationsSettings {
  rightClickCopyPaste: boolean;
}

export interface AppSettings {
  scanRoots: ScanRootSetting[];
  ignoredRepoPaths: string[];
  customCategories: string[];
  favoriteRepoIds: string[];
  // Rule: 文件树宽度属于按项目保存的界面偏好，仓库 ID 与 `createRepoID` 一致。
  fileTreeWidths: Record<string, number>;
  aiCommit: AICommitSettings;
  gitBehavior: GitBehaviorSettings;
  terminalOperations: TerminalOperationsSettings;
  commandCenter: CommandCenterSettings;
  backgroundTasks: Record<string, import('./background-task.js').BackgroundTaskDefinition[]>;
}

export interface RepoLog {
  repoId: string;
  repoName: string;
  path: string;
  content: string;
}

export interface RepoDetail extends Repo {
  files: FileChange[];
  stagedCount: number;
  unstagedCount: number;
  scannedAt: string;
  history: CommitSummary[];
  historyTotal: number;
  historyHasMore: boolean;
  historyRevision?: string;
}

export interface RepoSnapshotUpdate {
  repo: RepoDetail;
  scannedAt: string;
}

export interface RepoCommandResult {
  repoPath: string;
  command: string;
  output: string;
  exitCode: number;
  startedAt: number;
  endedAt: number;
}

export interface TerminalSessionInfo {
  sessionId: string;
  repoId: string;
  repoPath: string;
  shell: string;
  startedAt: number;
}

export interface WorkspaceBootstrap {
  repos: Repo[];
  selectedRepoId: string;
  scannedAt: string;
  categories: string[];
}

export interface CommitSummary {
  hash: string;
  shortHash: string;
  author: string;
  time: string;
  message: string;
  additions: number;
  deletions: number;
  parents: number;
  parentHashes: string[];
  refs: string[];
  files: number;
}

export interface CommitDetail extends CommitSummary {
  body: string;
  authorEmail: string;
  committedAt: string;
  filesChanged: string[];
  changedFiles: FileChange[];
}

export interface RepoHistoryPage {
  repoId: string;
  repoName: string;
  path: string;
  offset: number;
  limit: number;
  total: number;
  hasMore: boolean;
  commits: CommitSummary[];
}

export interface AppSnapshot {
  scannedAt: string;
  categories: string[];
  repos: Repo[];
  repoDetails: Record<string, RepoDetail>;
  selectedRepoId: string;
  pullResults: PullResult[];
}

export type SettingsTab = 'repositories' | 'ai-commit' | 'git-behavior' | 'terminal-operations';
