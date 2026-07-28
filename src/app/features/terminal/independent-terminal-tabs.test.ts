import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getIndependentTerminalsForRepo,
  resolveMainTabForRepo,
  selectMainTabForRepo,
  type IndependentTerminalTab,
  type WorkspaceMainTabsByRepo,
} from './independent-terminal-tabs.js';

const terminals: IndependentTerminalTab[] = [
  { id: 'terminal-1', repoId: 'repo-a' },
  { id: 'terminal-2', repoId: 'repo-b' },
];

test('only exposes independent terminals owned by the selected repository', () => {
  assert.deepEqual(getIndependentTerminalsForRepo(terminals, 'repo-b'), [
    { id: 'terminal-2', repoId: 'repo-b' },
  ]);
});

test('each repository keeps its own selected main tab', () => {
  let tabs: WorkspaceMainTabsByRepo = {};
  tabs = selectMainTabForRepo(tabs, 'repo-a', 'terminal');

  assert.equal(resolveMainTabForRepo(tabs, 'repo-b', terminals), 'changes');

  tabs = selectMainTabForRepo(tabs, 'repo-b', 'history');
  assert.equal(resolveMainTabForRepo(tabs, 'repo-a', terminals), 'terminal');
  assert.equal(resolveMainTabForRepo(tabs, 'repo-b', terminals), 'history');
});

test('keeps the active independent terminal when it belongs to the selected repository', () => {
  assert.equal(resolveMainTabForRepo({ 'repo-a': 'terminal-1' }, 'repo-a', terminals), 'terminal-1');
});

test('does not expose another repository independent terminal as the selected tab', () => {
  assert.equal(resolveMainTabForRepo({ 'repo-b': 'terminal-1' }, 'repo-b', terminals), 'terminal');
});

test('falls back to changes after an independent terminal is removed', () => {
  assert.equal(resolveMainTabForRepo({ 'repo-a': 'terminal-1' }, 'repo-a', []), 'changes');
});
