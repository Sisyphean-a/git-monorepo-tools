import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getIndependentTerminalsForRepo,
  getTerminalTabIds,
  resolveMainTabForRepo,
  resolveNeighborTerminalTab,
  resolveTerminalSelectionAfterClose,
  selectMainTabForRepo,
  type IndependentTerminalTab,
  type WorkspaceMainTab,
  type WorkspaceMainTabsByRepo,
} from './terminal-workspace.js';

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

  tabs = selectMainTabForRepo(tabs, 'repo-b', 'files');
  assert.equal(resolveMainTabForRepo(tabs, 'repo-b', terminals), 'files');
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

test('orders the default terminal before independent terminals and omits a closed default tab', () => {
  assert.deepEqual(getTerminalTabIds(true, terminals), ['terminal', 'terminal-1', 'terminal-2']);
  assert.deepEqual(getTerminalTabIds(false, terminals), ['terminal-1', 'terminal-2']);
});

test('closes toward the nearest left terminal and takes the right one at the leftmost tab', () => {
  const tabIds: WorkspaceMainTab[] = ['terminal', 'terminal-1', 'terminal-2'];

  assert.equal(resolveNeighborTerminalTab(tabIds, 'terminal-2'), 'terminal-1');
  assert.equal(resolveNeighborTerminalTab(tabIds, 'terminal-1'), 'terminal');
  assert.equal(resolveNeighborTerminalTab(tabIds, 'terminal'), 'terminal-1');
  assert.equal(resolveNeighborTerminalTab(tabIds, 'terminal-9'), null);
});

test('activates the neighbor only when the closed terminal is the selected tab', () => {
  const tabIds: WorkspaceMainTab[] = ['terminal', 'terminal-1', 'terminal-2'];

  assert.equal(resolveTerminalSelectionAfterClose({ 'repo-a': 'terminal-2' }, 'repo-a', 'terminal-2', tabIds)['repo-a'], 'terminal-1');
  assert.deepEqual(resolveTerminalSelectionAfterClose({ 'repo-a': 'changes' }, 'repo-a', 'terminal-1', tabIds), { 'repo-a': 'changes' });
  assert.equal(resolveTerminalSelectionAfterClose({ 'repo-a': 'terminal-1' }, 'repo-a', 'terminal-1', ['terminal-1'])['repo-a'], 'terminal-1');
});
