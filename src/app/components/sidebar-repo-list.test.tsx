import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { SidebarRepoList } from './sidebar-repo-list.js';
import type { Repo } from '../domain/types.js';

const main: Repo = {
  id: 'main',
  name: 'my-repo',
  branch: 'master',
  path: 'E:/repos/my-repo',
  remote: 'origin',
  category: '工作区',
  modified: 0,
  ahead: 0,
  behind: 0,
  conflicts: 0,
  status: 'clean',
  lastScan: '2026-03-31 10:00:00',
  worktreeGroupId: 'wt-1',
  worktreeGroupName: 'my-repo',
  isMainWorktree: true,
};

const linked: Repo = {
  ...main,
  id: 'feat-x',
  name: 'feat-x',
  branch: 'feat/x',
  path: 'E:/repos/feat-x',
  modified: 2,
  status: 'changed',
  isMainWorktree: false,
};

function render(repos: Repo[], selectedRepoId: string, overrides: { search?: string; favoriteRepoIds?: string[] } = {}) {
  return renderToStaticMarkup(
    <SidebarRepoList
      repos={repos}
      categories={['工作区']}
      favoriteRepoIds={overrides.favoriteRepoIds ?? []}
      search={overrides.search ?? ''}
      terminalStates={{}}
      selectedRepoId={selectedRepoId}
      onSelectRepo={() => {}}
    />,
  );
}

test('renders multiple worktrees under one expandable repository group', () => {
  const html = render([linked, main], 'main');

  assert.match(html, /class="sidebar-worktree-group"/);
  assert.match(html, /aria-expanded="true"/);
  assert.match(html, />my-repo</);
  assert.match(html, />feat-x</);
  assert.match(html, /feat\/x/);
  assert.match(html, />主</);
  assert.match(html, />2</);
});

test('keeps single-worktree repositories flat without group chrome', () => {
  const html = render([main], 'main');

  assert.doesNotMatch(html, /sidebar-worktree-group/);
  assert.doesNotMatch(html, /sidebar-worktree-toggle/);
  assert.match(html, />my-repo</);
});

test('search expands the matching group and hides non-matching worktrees', () => {
  const html = render([main, linked], 'main', { search: 'feat' });

  assert.match(html, /aria-hidden="true"/);
  assert.match(html, />my-repo</);
  assert.match(html, />feat-x</);
  assert.doesNotMatch(html, /title="E:\/repos\/my-repo"/);
});

test('favoriting one worktree moves the whole group into favorites', () => {
  const html = render([main, linked], 'main', { favoriteRepoIds: ['feat-x'] });

  assert.match(html, />收藏</);
  const favoriteIndex = html.indexOf('收藏');
  const worktreeIndex = html.indexOf('class="sidebar-worktree-group"');
  assert.ok(favoriteIndex >= 0 && favoriteIndex < worktreeIndex);
  assert.equal((html.match(/class="sidebar-worktree-group"/g) ?? []).length, 1);
});
