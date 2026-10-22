import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { RepoListStatus } from './repo-list-status.js';
import { RepoHeader, summarizeFiles } from './workspace-parts.js';
import { groupReposByWorktree, type WorktreeGroup } from '../domain/worktree-groups.js';
import type { Repo } from '../domain/types.js';

const repo: Repo = {
  id: 'r', name: 'repo', path: '/repo', branch: 'main', remote: 'origin', category: 'test',
  modified: 0, ahead: 0, behind: 0, conflicts: 0, status: 'clean', lastScan: '10:01:00',
};

function renderHeader(value: Repo, worktreeGroup?: WorktreeGroup | null) {
  return renderToStaticMarkup(<RepoHeader repo={value} worktreeGroup={worktreeGroup} fileSummary={summarizeFiles([])} onOpenMonitor={() => {}} onOpenBackgroundTasks={() => {}} onOpenFolder={() => {}} onOpenTerminal={() => {}} onOpenDiffViewer={() => {}} onOpenSettings={() => {}} />);
}

test('remote failure remains visible independently of a clean local worktree', () => {
  const failed: Repo = { ...repo, remoteCheck: { status: 'error', checkedAt: '2026/10/13 10:00:00', error: 'Fetch timeout' } };
  const header = renderHeader(failed);
  assert.match(header, /本地更新于/);
  assert.match(header, /远端检查失败/);
  assert.match(header, /2026\/10\/13 10:00:00/);
  assert.match(header, /Fetch timeout/);
  assert.doesNotMatch(header, /本地扫描失败/);
  const sidebar = renderToStaticMarkup(<RepoListStatus repo={failed} />);
  assert.match(sidebar, /远端失败/);
  assert.match(sidebar, /Fetch timeout/);
  assert.doesNotMatch(sidebar, /最近一次远端检查无待同步提交/);
});

test('unchecked remotes are not presented as confirmed synchronized', () => {
  assert.match(renderHeader(repo), /远端尚未检查/);
  assert.match(renderToStaticMarkup(<RepoListStatus repo={repo} />), /远端未知/);
  const success: Repo = { ...repo, remoteCheck: { status: 'success', checkedAt: '2026/10/13 10:02:00' } };
  assert.match(renderHeader(success), /远端检查成功/);
  assert.match(renderToStaticMarkup(<RepoListStatus repo={success} />), /最近一次远端检查无待同步提交/);
});

test('header identifies the repository group and selected worktree', () => {
  const mainRepo: Repo = {
    ...repo,
    worktreeGroupId: 'wt-1',
    worktreeGroupName: 'repo',
    isMainWorktree: true,
  };
  const linkedRepo: Repo = {
    ...repo,
    id: 'feat',
    name: 'feat-x',
    path: '/repos/feat-x',
    worktreeGroupId: 'wt-1',
    worktreeGroupName: 'repo',
    isMainWorktree: false,
  };
  const group = groupReposByWorktree([mainRepo, linkedRepo])[0];
  assert.ok(group);

  const linkedHeader = renderHeader(linkedRepo, group);
  assert.match(linkedHeader, /工作树 · feat-x/);
  assert.match(linkedHeader, /2 个工作树/);

  const mainHeader = renderHeader(mainRepo, group);
  assert.match(mainHeader, /主工作树/);
});
