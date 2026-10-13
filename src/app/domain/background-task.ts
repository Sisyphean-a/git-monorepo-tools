export interface BackgroundTaskDefinition {
  id: string;
  name: string;
  command: string;
  workDir: string;
}

export interface BackgroundTaskRequest {
  taskId: string;
  repoId: string;
  repoName: string;
  repoPath: string;
  name: string;
  command: string;
  workDir: string;
}

export interface BackgroundTaskState extends BackgroundTaskRequest {
  runId: number;
  revision: number;
  status: 'running' | 'stopping' | 'stopped' | 'exited' | 'failed';
  startedAt: number;
  endedAt: number;
  exitCode: number | null;
  error: string;
}

export interface BackgroundTaskLog {
  text: string;
  cursor: number;
  reset: boolean;
  truncated: boolean;
}

export const TASK_LOG_BYTES = 128 * 1024;
export const taskKey = (repoId: string, taskId: string) => JSON.stringify([repoId, taskId]);
export const taskActive = (state?: BackgroundTaskState) => state?.status === 'running' || state?.status === 'stopping';

export function mergeTaskState(states: Record<string, BackgroundTaskState>, state: BackgroundTaskState) {
  const key = taskKey(state.repoId, state.taskId);
  if ((states[key]?.revision ?? -1) >= state.revision) return states;
  return { ...states, [key]: state };
}

export function taskStatusLabel(state?: BackgroundTaskState) {
  if (!state) return '未启动';
  return { running: '运行中', stopping: '停止中', stopped: '已停止', exited: '已结束', failed: '失败' }[state.status];
}

export function sanitizeBackgroundTasks(value: unknown): Record<string, BackgroundTaskDefinition[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: Record<string, BackgroundTaskDefinition[]> = {};
  for (const [repoId, raw] of Object.entries(value)) {
    if (!Array.isArray(raw) || !repoId.trim()) continue;
    const seen = new Set<string>();
    const tasks: BackgroundTaskDefinition[] = [];
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const text = (key: string) => typeof item[key] === 'string' ? item[key].trim() : '';
      const id = text('id'), name = text('name'), command = text('command');
      if (!id || !name || !command || seen.has(id)) continue;
      seen.add(id);
      tasks.push({ id, name, command, workDir: text('workDir') || '.' });
    }
    Object.defineProperty(result, repoId, { value: tasks, enumerable: true, configurable: true, writable: true });
  }
  return result;
}
