import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { AICommitSettingsTab } from './ai-commit-settings-tab.js';
import { GitBehaviorSettingsTab } from './git-behavior-settings-tab.js';
import { sanitizeSettings } from '../infrastructure/settings-store.js';

test('AI settings expose a separate proxy without displaying Git proxy values', () => {
  const draft = sanitizeSettings({
    aiCommit: { proxy: { enabled: true, host: 'ai-proxy', port: 8888 } },
    gitBehavior: { proxy: { enabled: false, host: 'git-proxy', port: 8080 } },
  });
  const aiHTML = renderToStaticMarkup(<AICommitSettingsTab draft={draft} setDraft={() => {}} />);
  assert.match(aiHTML, /AI 代理/);
  assert.match(aiHTML, /与 Git 代理独立/);
  assert.match(aiHTML, /关闭时直连，不读取环境代理/);
  assert.match(aiHTML, /value="ai-proxy"/);
  assert.match(aiHTML, /value="8888"/);
  assert.doesNotMatch(aiHTML, /value="git-proxy"|value="8080"/);
  const gitHTML = renderToStaticMarkup(<GitBehaviorSettingsTab draft={draft} setDraft={() => {}} />);
  assert.match(gitHTML, /value="git-proxy"/);
  assert.match(gitHTML, /value="8080"/);
  assert.doesNotMatch(gitHTML, /value="ai-proxy"|value="8888"/);
});
