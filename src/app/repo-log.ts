import { fetchRepoLog } from './api.js';
import type { AppSettings, RepoLog } from './types.js';

function formatRepoLogError(error: unknown) {
  return error instanceof Error ? error.message : '查看日志失败';
}

export async function viewRepoLog(
  repoId: string,
  settings: AppSettings,
  options: {
    onSuccess: (log: RepoLog) => void;
    onError: (message: string | null) => void;
    fetchLog?: (repoId: string, settings: AppSettings) => Promise<RepoLog>;
  },
) {
  const fetchLog = options.fetchLog ?? fetchRepoLog;
  try {
    const log = await fetchLog(repoId, settings);
    options.onSuccess(log);
    options.onError(null);
  } catch (error) {
    options.onError(formatRepoLogError(error));
    throw error;
  }
}
