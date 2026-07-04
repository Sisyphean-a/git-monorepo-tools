export type RepoStatus = 'clean' | 'changed' | 'conflict' | 'checking' | 'error';
export type FileStatus = 'A' | 'M' | 'D' | 'R';
export type RepoMutationAction = 'stage-all' | 'unstage-all' | 'stage-file' | 'unstage-file' | 'commit' | 'pull' | 'push' | 'discard-all';
export type BuiltInCommandAction = 'stage-all' | 'unstage-all' | 'generate' | 'commit' | 'pull' | 'push' | 'refresh';

export interface Repo {
  id: string;
  name: string;
  branch: string;
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
}

export interface FileChange {
  id: string;
  status: FileStatus;
  path: string;
  additions: number;
  deletions: number;
  size: string;
  staged: boolean;
}

export interface PullResult {
  id: string;
  name: string;
  path: string;
  result: 'pulled' | 'pushed' | 'skipped' | 'failed' | 'uptodate';
  detail: string;
  commits?: number;
}

export interface CommitCandidate {
  id: string;
  style: string;
  icon: string;
  title: string;
  body: string;
  full: string;
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
  generateThree: boolean;
  stagedOnly: boolean;
  promptTemplate: string;
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
}

export interface AppSettings {
  scanRoots: ScanRootSetting[];
  customCategories: string[];
  aiCommit: AICommitSettings;
  gitBehavior: GitBehaviorSettings;
  commandCenter: CommandCenterSettings;
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
}

export type GitOperationStatus = 'success' | 'skipped' | 'failed' | 'noop';

export interface GitOperationResult {
  repoId: string;
  repoName: string;
  operation: 'pull' | 'push' | 'commit' | 'stage' | 'unstage' | 'scan';
  status: GitOperationStatus;
  message: string;
  stdout?: string;
  stderr?: string;
  startedAt: number;
  endedAt: number;
}

export interface BatchGitOperationResult {
  operation: 'pullAll' | 'pushAll';
  total: number;
  success: number;
  skipped: number;
  failed: number;
  noop: number;
  items: GitOperationResult[];
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
}

export interface AppSnapshot {
  scannedAt: string;
  categories: string[];
  repos: Repo[];
  repoDetails: Record<string, RepoDetail>;
  selectedRepoId: string;
  pullResults: PullResult[];
  commitCandidates: Record<string, CommitCandidate[]>;
}

export type SettingsTab = 'repositories' | 'ai-commit' | 'git-behavior' | 'commands';
