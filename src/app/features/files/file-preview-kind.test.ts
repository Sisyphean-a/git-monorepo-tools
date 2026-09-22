import test from 'node:test';
import assert from 'node:assert/strict';
import hljs from 'highlight.js/lib/common';
import {
  detectPreviewKind,
  isMarkdownPath,
  languageByExtension,
  languageForPath,
  maxPreviewRenderBytes,
} from './file-preview-kind.js';

test('markdown extensions are recognized regardless of the directory', () => {
  assert.equal(detectPreviewKind('README.md'), 'markdown');
  assert.equal(detectPreviewKind('docs/guide.MARKDOWN'), 'markdown');
  assert.equal(isMarkdownPath('a/b/notes.mdx'), true);
  assert.equal(isMarkdownPath('a/b/notes.ts'), false);
});

test('known extensions map to registered highlight.js languages', () => {
  assert.equal(languageForPath('src/app.tsx'), 'typescript');
  assert.equal(languageForPath('Makefile'), 'makefile');
  assert.equal(languageForPath('scripts/build.sh'), 'bash');
  assert.equal(languageForPath('deploy/pipeline.yml'), 'yaml');
  assert.equal(languageForPath('web/index.html'), 'xml');
});

test('unknown, hidden and extensionless files stay plain text', () => {
  assert.equal(detectPreviewKind('notes.txt'), 'text');
  assert.equal(detectPreviewKind('assets/logo.png'), 'text');
  assert.equal(languageForPath('LICENSE'), null);
  assert.equal(languageForPath('.gitignore'), null);
});

test('render limit stays below the backend preview cap', () => {
  assert.ok(maxPreviewRenderBytes > 0);
  assert.ok(maxPreviewRenderBytes < 1024 * 1024);
});

// Guard: 映射表里的语言 id 必须真的被 highlight.js common 注册，否则高亮会静默退化成纯文本。
test('every mapped language id is registered by highlight.js common', () => {
  const registered = Object.entries(languageByExtension).filter(([, language]) => !hljs.getLanguage(language));
  assert.deepEqual(registered, []);
  assert.ok(hljs.getLanguage(languageForPath('file.ts') ?? ''));
});
