import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { RepoHistoryTab } from './repo-history-tab.js';
import { BackendProvider } from '../application/backend-context.js';
import { DEFAULT_SETTINGS } from '../infrastructure/settings-store.js';
import type { AppBackend } from '../application/ports.js';
import type { CommitSummary } from '../domain/types.js';

const commit: CommitSummary = {
  hash: 'abc',
  shortHash: 'abc',
  author: 'Test User',
  time: '1 hour ago',
  message: 'feat: history scope',
  additions: 10,
  deletions: 2,
  parents: 1,
  parentHashes: ['parent'],
  refs: ['main'],
  files: 3,
};

function render(commits: CommitSummary[]) {
  return renderToStaticMarkup(
    <BackendProvider backend={{} as AppBackend}>
      <RepoHistoryTab
        repoId="repo-1"
        historyRevision="rev-1"
        initialCommits={commits}
        initialTotal={commits.length}
        initialHasMore={false}
        settings={DEFAULT_SETTINGS}
        active={false}
        onOpenDiffViewer={() => {}}
      />
    </BackendProvider>,
  );
}

test('history header exposes the branch scope picker and commit list', () => {
  const html = render([commit]);

  assert.match(html, /history-scope-trigger/);
  assert.match(html, /全部分支/);
  assert.match(html, /提交 1\/1/);
  assert.match(html, /feat: history scope/);
  assert.match(html, /提交详情/);
});

test('empty history keeps the scope picker visible instead of blocking scope changes', () => {
  const html = render([]);

  assert.match(html, /history-scope-trigger/);
  assert.match(html, /当前范围暂无提交历史/);
});
