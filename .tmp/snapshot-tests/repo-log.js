import { fetchRepoLog } from './api.js';
function formatRepoLogError(error) {
    return error instanceof Error ? error.message : '查看日志失败';
}
export async function viewRepoLog(repoId, settings, options) {
    const fetchLog = options.fetchLog ?? fetchRepoLog;
    try {
        const log = await fetchLog(repoId, settings);
        options.onSuccess(log);
        options.onError(null);
    }
    catch (error) {
        options.onError(formatRepoLogError(error));
        throw error;
    }
}
