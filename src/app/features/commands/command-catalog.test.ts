import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCommandCatalogAction,
  getCommandCatalogView,
  getRepoCommands,
  moveCommand,
  sanitizeCommandCatalog,
} from './command-catalog.js';

const catalog = {
  combos: [],
  customCommands: [{ id: 'global-check', label: '全局检查', command: 'npm run check' }],
  projectCommands: {
    'repo-alpha': [{ id: 'alpha-build', label: '构建 Alpha', command: 'npm run build:alpha' }],
    'repo-beta': [{ id: 'beta-build', label: '构建 Beta', command: 'npm run build:beta' }],
  },
};

test('selects only the current project commands and keeps project commands first', () => {
  const view = getCommandCatalogView(catalog, 'repo-alpha');
  assert.deepEqual(view.projectCommands, [
    { id: 'alpha-build', label: '构建 Alpha', command: 'npm run build:alpha' },
  ]);
  assert.deepEqual(getRepoCommands(catalog, 'repo-alpha'), [
    { scope: 'project', command: { id: 'alpha-build', label: '构建 Alpha', command: 'npm run build:alpha' } },
    { scope: 'global', command: { id: 'global-check', label: '全局检查', command: 'npm run check' } },
  ]);
  assert.deepEqual(getCommandCatalogView(catalog, 'repo-other').projectCommands, []);
});

test('applies project command edits immutably and removes an empty project list', () => {
  const replaced = applyCommandCatalogAction(catalog, {
    type: 'replace-custom',
    scope: 'project',
    repoId: 'repo-alpha',
    index: 0,
    command: { id: 'alpha-test', label: '测试 Alpha', command: 'npm test -- alpha' },
  });

  assert.deepEqual(replaced.projectCommands['repo-alpha'], [
    { id: 'alpha-test', label: '测试 Alpha', command: 'npm test -- alpha' },
  ]);
  assert.deepEqual(catalog.projectCommands['repo-alpha'], [
    { id: 'alpha-build', label: '构建 Alpha', command: 'npm run build:alpha' },
  ]);

  const removed = applyCommandCatalogAction(replaced, {
    type: 'remove-custom',
    scope: 'project',
    repoId: 'repo-alpha',
    index: 0,
  });
  assert.equal(removed.projectCommands['repo-alpha'], undefined);
});

test('moves commands in the requested order', () => {
  assert.deepEqual(moveCommand(['first', 'second', 'third'], 2, 0), ['third', 'first', 'second']);
});

test('sanitizes saved commands without flattening multiline shell input', () => {
  const command = 'npm run build\nnpm run test';
  const sanitized = sanitizeCommandCatalog({
    combos: [],
    customCommands: [{ id: 'global-check', label: '检查', command }],
    projectCommands: {
      'repo-alpha': [{ id: 'alpha-check', label: '检查 Alpha', command }],
    },
  });

  assert.equal(sanitized.customCommands[0]?.command, command);
  assert.equal(sanitized.projectCommands['repo-alpha']?.[0]?.command, command);
});
