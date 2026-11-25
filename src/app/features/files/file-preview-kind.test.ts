import test from 'node:test';
import assert from 'node:assert/strict';
import hljs from './preview-highlighter.js';
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

test('Vue 单文件组件按代码预览，扩展名不区分大小写', () => {
  assert.equal(languageForPath('src/App.vue'), 'xml');
  assert.equal(detectPreviewKind('src/components/Panel.VUE'), 'code');
});

test('Vue 高亮覆盖模板标签、内嵌脚本和样式，并转义原始标签', () => {
  const content = `<template><button v-if="visible">{{ label }}</button></template>
<script setup>const label = 'Hello';</script>
<style scoped>button { color: red; }</style>`;
  const language = languageForPath('src/App.vue');
  assert.ok(language);
  const html = hljs.highlight(content, { language, ignoreIllegals: true }).value;
  assert.match(html, /hljs-name[^>]*>button</);
  assert.match(html, /hljs-attr[^>]*>v-if</);
  assert.match(html, /language-javascript/);
  assert.match(html, /hljs-keyword[^>]*>const</);
  assert.match(html, /language-css/);
  assert.match(html, /hljs-attribute[^>]*>color</);
  assert.ok(!html.includes('<template>'));
  assert.ok(!html.includes('<script'));
});

test('special filenames use their appropriate registered grammars', () => {
  for (const path of ['.gitignore', 'src/.dockerignore', '.npmignore', '.git/info/exclude']) {
    assert.equal(languageForPath(path), 'gitignore');
    assert.equal(detectPreviewKind(path), 'code');
  }
  for (const path of ['Dockerfile', 'docker/Dockerfile.dev', 'build/test.Dockerfile', 'Containerfile']) {
    assert.equal(languageForPath(path), 'dockerfile');
    assert.equal(detectPreviewKind(path), 'code');
  }
  assert.equal(languageForPath('.env.local'), 'bash');
  assert.match(hljs.highlight('# comment\n*.log\n!important.log', { language: 'gitignore' }).value, /hljs-comment/);
  assert.match(hljs.highlight('FROM node:20\nRUN npm ci', { language: 'dockerfile' }).value, /hljs-keyword/);
});

test('unknown, hidden and extensionless files stay plain text', () => {
  assert.equal(detectPreviewKind('notes.txt'), 'text');
  assert.equal(detectPreviewKind('assets/logo.png'), 'text');
  assert.equal(languageForPath('LICENSE'), null);
  assert.equal(languageForPath('.unknown'), null);
});

test('render limit stays below the backend preview cap', () => {
  assert.ok(maxPreviewRenderBytes > 0);
  assert.ok(maxPreviewRenderBytes < 1024 * 1024);
});

// 约束：映射表里的语言 id 必须真的被 highlight.js common 注册，否则高亮会静默退化成纯文本。
test('every mapped language id is registered by highlight.js common', () => {
  const registered = Object.entries(languageByExtension).filter(([, language]) => !hljs.getLanguage(language));
  assert.deepEqual(registered, []);
  assert.ok(hljs.getLanguage(languageForPath('file.ts') ?? ''));
});
