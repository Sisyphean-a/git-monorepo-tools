import type { PullResult } from './types.js';

const RESULT_PRIORITY: Record<PullResult['result'], number> = {
  failed: 0,
  pulled: 1,
  pushed: 1,
  skipped: 2,
  uptodate: 3,
};

export function sortPullResults(results: PullResult[]) {
  return results
    .map((result, index) => ({ result, index }))
    .sort((left, right) => {
      const priority = RESULT_PRIORITY[left.result.result] - RESULT_PRIORITY[right.result.result];
      if (priority !== 0) return priority;
      const commits = (right.result.commits ?? 0) - (left.result.commits ?? 0);
      if (commits !== 0) return commits;
      return left.index - right.index;
    })
    .map(entry => entry.result);
}
