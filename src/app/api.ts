import { INITIAL_SNAPSHOT } from './data';
import type { AppSnapshot, PullResult } from './types';

interface SnapshotResponse {
  snapshot: AppSnapshot;
  results?: PullResult[];
  operation?: 'pullAll' | 'pushAll';
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

export async function fetchSnapshot() {
  return (await request('/api/snapshot')).snapshot;
}

export async function mutateRepo(repoId: string, action: string, body?: Record<string, unknown>) {
  return (await request(`/api/repos/${repoId}/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })).snapshot;
}

export async function runBatch(operation: 'pull' | 'push') {
  return request(`/api/batch/${operation}`, { method: 'POST' });
}
