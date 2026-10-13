import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeTaskState, taskActive, taskKey, sanitizeBackgroundTasks, type BackgroundTaskState } from './background-task.js';
import { DEFAULT_SETTINGS, sanitizeSettings, saveSettings, loadSettings } from '../infrastructure/settings-store.js';
import { createSettingsActions } from '../application/settings-actions.js';

const state: BackgroundTaskState = {
  taskId: 'dev', repoId: 'A', repoName: 'A', repoPath: '/A', name: 'dev', command: 'npm run dev', workDir: '.',
  runId: 1, revision: 2, status: 'running', startedAt: 1, endedAt: 0, exitCode: null, error: '',
};

test('task states are project-scoped and delayed startup responses cannot overwrite exit', () => {
  let states = mergeTaskState({}, state);
  states = mergeTaskState(states, { ...state, status: 'exited', revision: 3, exitCode: 0 });
  const ended = states;
  assert.equal(mergeTaskState(states, state), ended);
  states = mergeTaskState(states, { ...state, repoId: 'B' });
  assert.equal(taskActive(states[taskKey('A', 'dev')]), false);
  assert.equal(taskActive(states[taskKey('B', 'dev')]), true);
  assert.notEqual(taskKey('a/b', 'c'), taskKey('a', 'b/c'));
});

test('old settings migrate to no tasks without changing existing commands', () => {
  const old = { ...DEFAULT_SETTINGS, backgroundTasks: undefined };
  const settings = sanitizeSettings(old);
  assert.deepEqual(settings.backgroundTasks, {});
  assert.deepEqual(settings.commandCenter, DEFAULT_SETTINGS.commandCenter);
  assert.deepEqual(sanitizeBackgroundTasks({ A: [
    { id: ' dev ', name: ' 开发 ', command: ' npm run dev ', workDir: '' },
    { id: 'dev', name: 'duplicate', command: 'npm start' },
    { id: 'bad', name: '', command: 'npm start' },
  ], B: [{ id: 'dev', name: 'B', command: 'npm start', workDir: 'frontend' }] }), {
    A: [{ id: 'dev', name: '开发', command: 'npm run dev', workDir: '.' }],
    B: [{ id: 'dev', name: 'B', command: 'npm start', workDir: 'frontend' }],
  });
});

test('task configuration persists without runtime state or Git scanning', () => {
  const oldWindow = globalThis.window;
  let stored = '';
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    localStorage: { setItem: (_: string, value: string) => { stored = value; }, getItem: () => stored },
  } });
  try {
    const tasks = [{ id: 'dev', name: '开发', command: 'npm run dev', workDir: '.' }];
    saveSettings({ ...DEFAULT_SETTINGS, backgroundTasks: { A: tasks } });
    assert.deepEqual(loadSettings().backgroundTasks, { A: tasks });
    assert.ok(!stored.includes('runId'));
    let scans = 0;
    const updated: unknown[] = [];
    const actions = createSettingsActions({
      settings: DEFAULT_SETTINGS, setSettings: value => { updated.push(value); }, snapshot: null,
      settingsStore: { loadSettings, saveSettings, sanitizeSettings },
      backend: { pickFolder: async () => null }, refreshSnapshot: async () => { scans++; }, reportError: () => {},
    });
    actions.setBackgroundTasks('A', tasks);
    assert.equal(scans, 0);
    assert.equal(updated.length, 1);
    assert.deepEqual(loadSettings().backgroundTasks.A, tasks);
  } finally { Object.defineProperty(globalThis, 'window', { configurable: true, value: oldWindow }); }
});
