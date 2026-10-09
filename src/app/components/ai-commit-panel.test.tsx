import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { AiCommitPanel } from './ai-commit-panel.js';
import { describeRepoActionError } from '../application/repo-action-error.js';

test('each right-hand Git action displays its name, cause, remedy and complete escaped error', () => {
  for (const action of ['stage-all', 'unstage-all', 'generate', 'commit', 'pull', 'push', 'refresh', 'discard-all']) {
    const error = describeRepoActionError(action, 'fatal: Authentication failed\n<script>file.ts</script>', { name: 'own-wails', path: 'E:/github/own-wails' });
    const html = renderToStaticMarkup(<AiCommitPanel message="" error={error} actionGroups={[]} commandSections={[]} commandConsole={null} onMessageChange={() => {}} onClearConsole={() => {}} onTerminateConsole={async () => {}} />);
    assert.match(html, /role="alert"/);
    assert.ok(html.includes(error.title));
    assert.ok(html.includes('own-wails') && html.includes('E:/github/own-wails'));
    assert.ok(html.includes(error.reason) && html.includes(error.suggestion));
    assert.match(html, /原始错误/);
    assert.match(html, /<details open=""/);
    assert.match(html, /fatal: Authentication failed\n&lt;script&gt;file.ts&lt;\/script&gt;/);
    assert.doesNotMatch(html, /<script>/);
  }
});

test('no error alert remains when the next action clears its failure state', () => {
  const html = renderToStaticMarkup(<AiCommitPanel message="" error={null} actionGroups={[]} commandSections={[]} commandConsole={null} onMessageChange={() => {}} onClearConsole={() => {}} onTerminateConsole={async () => {}} />);
  assert.doesNotMatch(html, /role="alert"/);
});
