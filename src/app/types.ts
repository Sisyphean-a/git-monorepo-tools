export type RepoStatus = 'clean' | 'changed' | 'conflict' | 'checking';
export type FileStatus = 'A' | 'M' | 'D' | 'R';

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

export interface DiffLine {
  type: 'hunk' | 'added' | 'deleted' | 'context';
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
  diffLines: DiffLine[];
  commitCandidates: Record<string, CommitCandidate[]>;
}
