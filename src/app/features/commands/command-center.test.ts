import test from 'node:test';
import assert from 'node:assert/strict';
import { getProjectCommands } from './command-center.js';

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
