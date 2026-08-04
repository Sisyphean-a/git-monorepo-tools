import test from 'node:test';
import assert from 'node:assert/strict';
import { filterMonitoredRepos } from './repositories-settings-tab.js';
import type { Repo } from '../domain/types.js';

const repo = (path: string): Repo => ({
  id: path,
  name: path.split(/[\\/]/).at(-1) ?? '',
  branch: 'main',
  path,
  remote: 'origin',
  category: '工作区',
  modified: 0,
  ahead: 0,
  behind: 0,
  conflicts: 0,
  status: 'clean',
  lastScan: '10:00:00',
});

test('does not render an ignored project in both repository sections', () => {
  const monitored = repo('E:/payday-vue-web');
  const remaining = repo('E:/other-project');

  const result = filterMonitoredRepos(
    [monitored, remaining],
    [' e:\\PAYDAY-VUE-WEB\\ '],
  );

  assert.deepEqual(result, [remaining]);
});
