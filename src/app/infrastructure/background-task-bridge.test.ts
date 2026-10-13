import test from 'node:test';
import assert from 'node:assert/strict';
import { listBackgroundTasks, startBackgroundTask, stopBackgroundTask, readBackgroundTaskLog, forgetBackgroundTask } from './wails-client.js';
import type { BackgroundTaskRequest } from '../domain/background-task.js';

test('task bridge preserves task identity and incremental log cursor without using command output', async () => {
  const oldWindow = globalThis.window;
  const calls: unknown[][] = [];
  const required = ['GetWorkspaceBootstrap', 'GetSnapshot', 'RefreshRepo', 'MutateRepo', 'RunBatch', 'GetRepoLog', 'GetRepoHistory', 'GetCommitDetail', 'RunRepoCommand', 'StopRepoCommand', 'EnsureTerminalSession', 'RestartTerminalSession', 'WriteTerminalInput', 'ResizeTerminal', 'GenerateCommitMessage', 'OpenFolder', 'OpenTerminal', 'OpenConflicts', 'PickFolder'];
  const bindings: Record<string, unknown> = Object.fromEntries(required.map(name => [name, async () => { throw new Error('unused'); }]));
  const request: BackgroundTaskRequest = { taskId: 'dev', repoId: 'A', repoName: 'A', repoPath: 'E:/A', name: '开发', command: 'npm run dev', workDir: 'frontend' };
  bindings.ListBackgroundTasks = async () => { calls.push(['list']); return []; };
  bindings.StartBackgroundTask = async (value: BackgroundTaskRequest) => { calls.push(['start', value]); return { ...value, runId: 9 }; };
  bindings.StopBackgroundTask = async (...args: unknown[]) => { calls.push(['stop', ...args]); };
  bindings.ReadBackgroundTaskLog = async (...args: unknown[]) => { calls.push(['log', ...args]); return { text: 'tail', cursor: 12, reset: false, truncated: false }; };
  bindings.ForgetBackgroundTask = async (...args: unknown[]) => { calls.push(['forget', ...args]); };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { go: { main: { App: bindings } } } });
  try {
    assert.deepEqual(await listBackgroundTasks(), []);
    assert.equal((await startBackgroundTask(request)).runId, 9);
    await stopBackgroundTask('A', 'dev');
    assert.equal((await readBackgroundTaskLog('A', 'dev', 9, 8)).text, 'tail');
    await forgetBackgroundTask('A', 'dev');
    assert.deepEqual(calls, [['list'], ['start', request], ['stop', 'A', 'dev'], ['log', 'A', 'dev', 9, 8], ['forget', 'A', 'dev']]);
    bindings.StopBackgroundTask = async () => { throw 'stop tree failure'; };
    await assert.rejects(stopBackgroundTask('A', 'dev'), error => error === 'stop tree failure');
    const checks: [string, () => Promise<unknown>][] = [
      ['ListBackgroundTasks', listBackgroundTasks],
      ['StartBackgroundTask', () => startBackgroundTask(request)],
      ['StopBackgroundTask', () => stopBackgroundTask('A', 'dev')],
      ['ReadBackgroundTaskLog', () => readBackgroundTaskLog('A', 'dev', 9, 8)],
      ['ForgetBackgroundTask', () => forgetBackgroundTask('A', 'dev')],
    ];
    for (const [binding, call] of checks) {
      delete bindings[binding];
      await assert.rejects(call(), /绑定不可用/);
    }
  } finally { Object.defineProperty(globalThis, 'window', { configurable: true, value: oldWindow }); }
});
