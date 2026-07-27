import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getIndependentTerminalsForRepo,
  resolveMainTabForRepo,
  type IndependentTerminalTab,
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

test('switching repositories replaces an active foreign terminal with the current repository terminal', () => {
  assert.equal(resolveMainTabForRepo('terminal-1', 'repo-b', terminals), 'terminal');
});

test('keeps the active independent terminal when it belongs to the selected repository', () => {
  assert.equal(resolveMainTabForRepo('terminal-1', 'repo-a', terminals), 'terminal-1');
});

test('falls back to changes after an independent terminal is removed', () => {
  assert.equal(resolveMainTabForRepo('terminal-1', 'repo-a', []), 'changes');
});
