import test from 'node:test';
import assert from 'node:assert/strict';
import { viewRepoLog } from './repo-log.js';
import type { AppSettings, RepoLog } from './types.js';

const settings: AppSettings = {
  scanRoots: [],
  customCategories: [],
  aiCommit: {
    apiKey: '',
    baseUrl: '',
    model: '',
    maxDiffChars: 2000,
    generateThree: false,
    stagedOnly: true,
    promptTemplate: '',
  },
  gitBehavior: {
    autoScanEnabled: true,
    autoScanIntervalSeconds: 60,
    pullStrategy: 'ff-only',
    pushStrategy: 'upstream-only',
    concurrency: 5,
    timeoutSeconds: 60,
  },
};

test('viewRepoLog reports failure instead of swallowing it', async () => {
  const errors: (string | null)[] = [];
  await assert.rejects(
    viewRepoLog('repo-1', settings, {
      fetchLog: async () => {
        throw new Error('log-boom');
      },
      onSuccess: () => {
        throw new Error('should not succeed');
      },
      onError: message => errors.push(message),
    }),
    /log-boom/,
  );

  assert.deepEqual(errors, ['log-boom']);
});

test('viewRepoLog clears previous error after success', async () => {
  const errors: (string | null)[] = [];
  const logs: RepoLog[] = [];
  await viewRepoLog('repo-1', settings, {
    fetchLog: async () => ({
      repoId: 'repo-1',
      repoName: 'repo',
      path: '/repo',
      content: 'ok',
    }),
    onSuccess: log => logs.push(log),
    onError: message => errors.push(message),
  });

  assert.equal(logs[0]?.content, 'ok');
  assert.deepEqual(errors, [null]);
});
