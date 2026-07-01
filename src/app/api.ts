import { INITIAL_SNAPSHOT } from './data';
import type { AICommitPreview, AppSettings, AppSnapshot, CommitCandidate, PullResult, RepoLog } from './types';

interface SnapshotResponse {
  snapshot: AppSnapshot;
  results?: PullResult[];
  operation?: 'pullAll' | 'pushAll';
  log?: RepoLog;
  candidates?: CommitCandidate[];
  path?: string | null;
  error?: string;
}

async function request(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const payload = (await response.json()) as SnapshotResponse;
  if (!response.ok || payload.error) {
    throw new Error(payload.error ?? '请求失败');
  }
  return payload;
}

export function getInitialSnapshot() {
  return INITIAL_SNAPSHOT;
}

function buildQuery(settings?: AppSettings) {
  if (!settings) return '';
  const params = new URLSearchParams();
  params.set('scanRoots', JSON.stringify(settings.scanRoots));
  params.set('pullStrategy', settings.gitBehavior.pullStrategy);
  params.set('pushStrategy', settings.gitBehavior.pushStrategy);
  return `?${params.toString()}`;
}

export async function fetchSnapshot(settings?: AppSettings) {
  return (await request(`/api/snapshot${buildQuery(settings)}`)).snapshot;
}

export async function mutateRepo(repoId: string, action: string, settings?: AppSettings, body?: Record<string, unknown>) {
  return (await request(`/api/repos/${repoId}/${action}${buildQuery(settings)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })).snapshot;
}

export async function runBatch(operation: 'pull' | 'push', settings?: AppSettings) {
  return request(`/api/batch/${operation}${buildQuery(settings)}`, { method: 'POST' });
}

export async function fetchRepoLog(repoId: string, settings: AppSettings) {
  return (await request(`/api/repos/${repoId}/log${buildQuery(settings)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  })).log ?? null;
}

export async function invokeLocalRepoAction(repoId: string, action: 'open-folder' | 'open-terminal' | 'open-conflicts', settings: AppSettings, path: string) {
  return mutateRepo(repoId, action, settings, { path });
}

export async function generateCommitCandidates(repoId: string, settings: AppSettings, styleHint?: string): Promise<AICommitPreview> {
  const candidates = (await request(`/api/repos/${repoId}/generate-commit${buildQuery(settings)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      aiCommit: settings.aiCommit,
      styleHint,
    }),
  })).candidates ?? [];
  return { candidates };
}

export async function pickFolder() {
  return (await request('/api/system/pick-folder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  })).path ?? null;
}
