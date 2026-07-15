import { useState } from 'react';
import type { AppSettings, PullResult, RepoSnapshotUpdate } from '../domain/types.js';
import type { WorkspaceBackend } from './ports.js';

type RunQueuedTask = <T>(task: () => Promise<T>, onSuccess?: (result: T) => void) => Promise<T>;

export interface BatchControllerConfig {
  backend: Pick<WorkspaceBackend, 'runBatch'>;
  settings: AppSettings;
  runQueuedTask: RunQueuedTask;
  applyRepoUpdate: (update: RepoSnapshotUpdate) => void;
  mutateRepo: (repoId: string, action: 'pull' | 'push') => Promise<RepoSnapshotUpdate>;
  openRepo: (path: string) => Promise<void>;
  openRepoLog: (repoId: string) => Promise<void>;
  reportError: (error: unknown, fallback: string) => void;
}

export interface BatchRunState {
  setOpen(value: boolean): void;
  setOperation(value: 'pullAll' | 'pushAll'): void;
  setResults(value: PullResult[]): void;
  setScannedAt(value: string): void;
  setActiveAction(value: 'pull' | 'push' | null): void;
}

interface RetryRepoRequest {
  config: BatchControllerConfig;
  updateResult: (repoId: string, patch: Pick<PullResult, 'result' | 'detail'>) => void;
  repoId: string;
  batchOperation: 'pullAll' | 'pushAll';
}

export function useBatchController(config: BatchControllerConfig) {
  const state = useBatchState();
  const updateResult = (repoId: string, patch: Pick<PullResult, 'result' | 'detail'>) => {
    state.setResults(current => current.map(result => result.id === repoId ? { ...result, ...patch } : result));
  };
  return {
    open: state.open,
    close: () => state.setOpen(false),
    operation: state.operation,
    results: state.results,
    scannedAt: state.scannedAt,
    activeAction: state.activeAction,
    runBatch: (action: 'pull' | 'push') => executeBatchAction(config, state, action),
    retryRepo: (repoId: string, batchOperation: 'pullAll' | 'pushAll') => retryRepo({
      config,
      updateResult,
      repoId,
      batchOperation,
    }),
    openRepo: config.openRepo,
    openRepoLog: config.openRepoLog,
  };
}

function useBatchState() {
  const [open, setOpen] = useState(false);
  const [operation, setOperation] = useState<'pullAll' | 'pushAll'>('pullAll');
  const [results, setResults] = useState<PullResult[]>([]);
  const [scannedAt, setScannedAt] = useState('');
  const [activeAction, setActiveAction] = useState<'pull' | 'push' | null>(null);
  return { open, setOpen, operation, setOperation, results, setResults, scannedAt, setScannedAt, activeAction, setActiveAction };
}

export async function executeBatchAction(
  config: BatchControllerConfig,
  state: BatchRunState,
  action: 'pull' | 'push',
) {
  state.setActiveAction(action);
  try {
    const response = await config.runQueuedTask(
      () => config.backend.runBatch(action, config.settings),
      result => result.updates?.forEach(config.applyRepoUpdate),
    );
    state.setOperation(response.operation ?? (action === 'pull' ? 'pullAll' : 'pushAll'));
    state.setResults(response.results ?? []);
    state.setScannedAt(response.scannedAt);
    state.setOpen(true);
  } catch (error) {
    config.reportError(error, action === 'pull' ? '批量拉取失败' : '批量推送失败');
  } finally {
    state.setActiveAction(null);
  }
}

async function retryRepo({ config, updateResult, repoId, batchOperation }: RetryRepoRequest) {
  const action = batchOperation === 'pullAll' ? 'pull' : 'push';
  try {
    await config.mutateRepo(repoId, action);
    updateResult(repoId, {
      result: action === 'pull' ? 'pulled' : 'pushed',
      detail: action === 'pull' ? '已完成重试拉取' : '已完成重试推送',
    });
  } catch (error) {
    updateResult(repoId, {
      result: 'failed',
      detail: error instanceof Error ? error.message : '重试失败',
    });
  }
}
