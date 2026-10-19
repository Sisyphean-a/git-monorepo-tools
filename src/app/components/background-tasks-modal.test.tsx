import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { BackgroundTasksModal } from './background-tasks-modal.js';
import { RepoHeader, summarizeFiles } from './workspace-parts.js';
import { DEFAULT_SETTINGS } from '../infrastructure/settings-store.js';
import { BackendProvider } from '../application/backend-context.js';
import type { AppBackend } from '../application/ports.js';
import type { BackgroundTaskController } from '../features/background-tasks/use-background-tasks.js';
import type { Repo } from '../domain/types.js';
import { taskKey, type BackgroundTaskState } from '../domain/background-task.js';

const repo: Repo = { id: 'A', name: 'repo A', path: 'E:/repo', branch: 'main', remote: 'origin', category: 'test', modified: 0, ahead: 0, behind: 0, conflicts: 0, status: 'clean', lastScan: 'now' };
const otherRepo: Repo = { ...repo, id: 'B', name: 'repo B', path: 'E:/other-repo' };
const controller: BackgroundTaskController = {
  states: {}, error: null, pending: new Set(), refresh: async () => {},
  start: async () => true, stop: async () => true, forget: async () => true,
};

test('entry is between folder and external terminal and shows running count', () => {
  const html = renderToStaticMarkup(<RepoHeader repo={repo} fileSummary={summarizeFiles([])} onOpenMonitor={() => {}} onOpenFolder={() => {}} onOpenBackgroundTasks={() => {}} backgroundTaskCount={2} onOpenTerminal={() => {}} onOpenDiffViewer={() => {}} onOpenSettings={() => {}} />);
  assert.ok(html.indexOf('文件夹') < html.indexOf('后台任务'));
  assert.ok(html.indexOf('后台任务') < html.indexOf('外部终端'));
  assert.match(html, /后台任务 · 2/);
});

test('dialog exposes empty state and explicit resource and lifecycle boundaries', () => {
  const html = renderToStaticMarkup(<BackgroundTasksModal repo={repo} repos={[repo, otherRepo]} settings={DEFAULT_SETTINGS} controller={controller} onSave={() => {}} onClose={() => {}} />);
  assert.match(html, /role="dialog"/);
  assert.match(html, /收起窗口不会停止任务/);
  assert.match(html, /还没有任务/);
  assert.match(html, /128 KiB/);
  assert.match(html, /不支持交互/);
  assert.match(html, /退出应用停止任务/);
  assert.doesNotMatch(html, /xterm/);
});

test('dialog defaults to all project tasks without starting configured commands', () => {
  const settings = { ...DEFAULT_SETTINGS, backgroundTasks: {
    A: [{ id: 'dev', name: '开发 A', command: 'npm run dev', workDir: '.' }],
    B: [{ id: 'dev', name: '开发 B', command: 'npm start', workDir: '.' }],
  } };
  let starts = 0;
  const html = renderToStaticMarkup(<BackendProvider backend={{} as AppBackend}><BackgroundTasksModal repo={repo} repos={[repo, otherRepo]} settings={settings} controller={{ ...controller, start: async () => { starts++; return true; } }} onSave={() => {}} onClose={() => {}} /></BackendProvider>);
  assert.match(html, /<option value="all" selected="">全部任务<\/option>/);
  assert.match(html, /开发 A/);
  assert.match(html, /开发 B/);
  assert.match(html, /repo A · npm run dev/);
  assert.match(html, /repo B · npm start/);
  assert.match(html, /任务尚未启动/);
  assert.equal(starts, 0);
});

test('all tasks remain visible without a current project and preserve sessions outside discovery', () => {
  const state: BackgroundTaskState = { repoId: 'missing', repoName: '离线项目', repoPath: 'E:/missing', taskId: 'watch', name: '监听任务', command: 'npm run watch', workDir: '.', runId: 1, revision: 1, status: 'running', startedAt: 1, endedAt: 0, exitCode: null, error: '' };
  const settings = { ...DEFAULT_SETTINGS, backgroundTasks: { B: [{ id: 'dev', name: '开发 B', command: 'npm start', workDir: '.' }] } };
  const html = renderToStaticMarkup(<BackendProvider backend={{} as AppBackend}><BackgroundTasksModal repo={null} repos={[otherRepo]} settings={settings} controller={{ ...controller, states: { [taskKey(state.repoId, state.taskId)]: state } }} onSave={() => {}} onClose={() => {}} /></BackendProvider>);
  assert.match(html, /开发 B/);
  assert.match(html, /离线项目 · npm run watch/);
  assert.match(html, /disabled="" title="未选择项目"/);
});

test('list offers start and stop in place for every task state', () => {
  const settings = { ...DEFAULT_SETTINGS, backgroundTasks: {
    A: [{ id: 'idle', name: '待启动任务', command: 'npm run dev', workDir: '.' }],
    B: [{ id: 'dev', name: '目标任务', command: 'npm start', workDir: '.' }],
  } };
  for (const status of [undefined, 'running', 'stopping', 'stopped', 'exited', 'failed'] as const) {
    const state: BackgroundTaskState | undefined = status && { repoId: 'B', repoName: otherRepo.name, repoPath: otherRepo.path, taskId: 'dev', name: '目标任务', command: 'npm start', workDir: '.', runId: 1, revision: 1, status, startedAt: 1, endedAt: 0, exitCode: null, error: '' };
    const html = renderToStaticMarkup(<BackgroundTasksModal repo={repo} repos={[repo, otherRepo]} settings={settings} controller={{ ...controller, states: state ? { [taskKey('B', 'dev')]: state } : {} }} onSave={() => {}} onClose={() => {}} />);
    const list = html.match(/<aside\b[^>]*>([\s\S]*?)<\/aside>/)?.[1];
    assert.ok(list);
    const active = status === 'running' || status === 'stopping';
    const action = list.match(/<button[^>]*aria-label="(启动|停止) 目标任务"[^>]*>/)?.[0];
    assert.ok(action, `列表缺少 ${status ?? '未启动'} 状态的操作`);
    assert.match(action, new RegExp(`aria-label="${active ? '停止' : '启动'} 目标任务"`));
    assert.equal(action.includes('disabled=""'), status === 'stopping');
    assert.equal(action.includes('aria-busy="true"'), status === 'stopping');
    assert.equal(list.match(/aria-label="启动 待启动任务"/g)?.length, 1);
  }
});

test('list disables only the pending task and still allows other tasks to start', () => {
  const settings = { ...DEFAULT_SETTINGS, backgroundTasks: { A: [
    { id: 'one', name: '任务一', command: 'npm start', workDir: '.' },
    { id: 'two', name: '任务二', command: 'npm run dev', workDir: '.' },
  ] } };
  const html = renderToStaticMarkup(<BackgroundTasksModal repo={repo} repos={[repo]} settings={settings} controller={{ ...controller, pending: new Set([taskKey('A', 'one')]) }} onSave={() => {}} onClose={() => {}} />);
  const list = html.match(/<aside\b[^>]*>([\s\S]*?)<\/aside>/)?.[1];
  assert.ok(list);
  assert.match(list.match(/<button[^>]*aria-label="启动 任务一"[^>]*>/)?.[0] ?? '', /disabled=""/);
  assert.doesNotMatch(list.match(/<button[^>]*aria-label="启动 任务二"[^>]*>/)?.[0] ?? '', /disabled/);
});

test('list can stop sessions outside discovery but cannot restart them without configuration', () => {
  const state: BackgroundTaskState = { repoId: 'missing', repoName: '离线项目', repoPath: 'E:/missing', taskId: 'watch', name: '监听任务', command: 'npm run watch', workDir: '.', runId: 1, revision: 1, status: 'running', startedAt: 1, endedAt: 0, exitCode: null, error: '' };
  for (const status of ['running', 'stopped'] as const) {
    const html = renderToStaticMarkup(<BackendProvider backend={{} as AppBackend}><BackgroundTasksModal repo={null} repos={[]} settings={DEFAULT_SETTINGS} controller={{ ...controller, states: { [taskKey(state.repoId, state.taskId)]: { ...state, status } } }} onSave={() => {}} onClose={() => {}} /></BackendProvider>);
    const list = html.match(/<aside\b[^>]*>([\s\S]*?)<\/aside>/)?.[1];
    assert.ok(list);
    assert.equal(list.includes('aria-label="停止 监听任务"'), status === 'running');
    assert.doesNotMatch(list, /aria-label="启动 监听任务"/);
  }
});

test('configured tasks merge their runtime state without duplicate rows', () => {
  const state: BackgroundTaskState = { repoId: 'B', repoName: otherRepo.name, repoPath: otherRepo.path, taskId: 'dev', name: '开发 B', command: 'npm start', workDir: '.', runId: 1, revision: 1, status: 'running', startedAt: 1, endedAt: 0, exitCode: null, error: '' };
  const settings = { ...DEFAULT_SETTINGS, backgroundTasks: { B: [{ id: 'dev', name: state.name, command: state.command, workDir: '.' }] } };
  const html = renderToStaticMarkup(<BackendProvider backend={{} as AppBackend}><BackgroundTasksModal repo={repo} repos={[repo, otherRepo]} settings={settings} controller={{ ...controller, states: { [taskKey('B', 'dev')]: state } }} onSave={() => {}} onClose={() => {}} /></BackendProvider>);
  assert.equal(html.match(/title="开发 B"/g)?.length, 1);
  assert.match(html, /运行中/);
  assert.match(html, />停止<\/button>/);
  assert.doesNotMatch(html, />删除<\/button>|>编辑<\/button>/);
});
