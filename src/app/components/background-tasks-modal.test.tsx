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

const repo: Repo = { id: 'A', name: 'repo A', path: 'E:/repo', branch: 'main', remote: 'origin', category: 'test', modified: 0, ahead: 0, behind: 0, conflicts: 0, status: 'clean', lastScan: 'now' };
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
  const html = renderToStaticMarkup(<BackgroundTasksModal repo={repo} settings={DEFAULT_SETTINGS} controller={controller} onSave={() => {}} onClose={() => {}} />);
  assert.match(html, /role="dialog"/);
  assert.match(html, /收起窗口不会停止任务/);
  assert.match(html, /还没有任务/);
  assert.match(html, /128 KiB/);
  assert.match(html, /不支持交互/);
  assert.match(html, /退出应用停止任务/);
  assert.doesNotMatch(html, /xterm/);
});

test('project tasks stay isolated and configured commands never start merely by rendering', () => {
  const settings = { ...DEFAULT_SETTINGS, backgroundTasks: {
    A: [{ id: 'dev', name: '开发 A', command: 'npm run dev', workDir: '.' }],
    B: [{ id: 'dev', name: '开发 B', command: 'npm start', workDir: '.' }],
  } };
  let starts = 0;
  const html = renderToStaticMarkup(<BackendProvider backend={{} as AppBackend}><BackgroundTasksModal repo={repo} settings={settings} controller={{ ...controller, start: async () => { starts++; return true; } }} onSave={() => {}} onClose={() => {}} /></BackendProvider>);
  assert.match(html, /开发 A/);
  assert.doesNotMatch(html, /开发 B/);
  assert.match(html, /任务尚未启动/);
  assert.equal(starts, 0);
});
