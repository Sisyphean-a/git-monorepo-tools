import test from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown } from './markdown.js';

test('raw HTML is escaped instead of injected', () => {
  const html = renderMarkdown('<img src=x onerror=alert(1)>\n\n<script>alert(1)</script>');
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('<script'));
  assert.ok(html.includes('&lt;img'));
});

test('external links keep their target and repository links defer to the component', () => {
  const html = renderMarkdown('[外链](https://example.com/x) [文件](./docs/a.md) [危险](javascript:alert(1))');
  assert.ok(html.includes('href="https://example.com/x"'));
  assert.ok(html.includes('data-md-href="./docs/a.md"'));
  assert.ok(html.includes('href="#"'));
  assert.ok(!html.includes('javascript:'));
  assert.ok(html.includes('危险'));
});

test('fenced code uses the injected highlighter and keeps the language', () => {
  const html = renderMarkdown('```ts title=app.ts\nconst a = 1;\n```', {
    highlight: (code, language) => `<i>${language}:${code}</i>`,
  });
  assert.ok(html.includes('<i>ts:const a = 1;</i>'));
  assert.ok(html.includes('class="hljs language-ts"'));
});

test('code fences fall back to escaped text when highlighting fails', () => {
  const html = renderMarkdown('```\n<b>raw</b>\n```', { highlight: () => null });
  assert.ok(html.includes('&lt;b&gt;raw&lt;/b&gt;'));
});

test('repository images are shown as text because binary preview is not available', () => {
  const repositoryImage = renderMarkdown('![截图](./shot.png)');
  assert.ok(repositoryImage.includes('截图'));
  assert.ok(!repositoryImage.includes('<img'));
  assert.ok(renderMarkdown('![badge](https://example.com/a.png)').includes('<img src="https://example.com/a.png"'));
});

test('gfm tables and task lists render', () => {
  const html = renderMarkdown('| a | b |\n| - | - |\n| 1 | 2 |\n\n- [x] done\n- [ ] todo');
  assert.ok(html.includes('<table>'));
  assert.ok(html.includes('type="checkbox"'));
});
