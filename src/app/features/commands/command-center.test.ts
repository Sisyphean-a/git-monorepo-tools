import test from 'node:test';
import assert from 'node:assert/strict';
import { getProjectCommands, moveCommand, sanitizeCommandCenter } from './command-center.js';

const projectCommands = {
  combos: [],
  customCommands: [],
  projectCommands: {
    'repo-alpha': [{ id: 'alpha-build', label: '构建 Alpha', command: 'npm run build:alpha' }],
    'repo-beta': [{ id: 'beta-build', label: '构建 Beta', command: 'npm run build:beta' }],
  },
};

test('getProjectCommands returns only commands configured for the current repository', () => {
  assert.deepEqual(getProjectCommands(projectCommands, 'repo-alpha'), [
    { id: 'alpha-build', label: '构建 Alpha', command: 'npm run build:alpha' },
  ]);
  assert.deepEqual(getProjectCommands(projectCommands, 'repo-beta'), [
    { id: 'beta-build', label: '构建 Beta', command: 'npm run build:beta' },
  ]);
  assert.deepEqual(getProjectCommands(projectCommands, 'repo-other'), []);
});

test('moveCommand returns commands in the requested order', () => {
  assert.deepEqual(moveCommand(['first', 'second', 'third'], 2, 0), ['third', 'first', 'second']);
});

test('sanitizeCommandCenter preserves multiline commands', () => {
  const command = 'npm run build\nnpm run test';
  const commandCenter = sanitizeCommandCenter({
    combos: [],
    customCommands: [{ id: 'global-check', label: '检查', command }],
    projectCommands: {
      'repo-alpha': [{ id: 'alpha-check', label: '检查 Alpha', command }],
    },
  });

  assert.equal(commandCenter.customCommands[0]?.command, command);
  assert.equal(commandCenter.projectCommands['repo-alpha']?.[0]?.command, command);
});
