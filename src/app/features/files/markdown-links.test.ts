import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyMarkdownHref, resolveMarkdownLink } from './markdown-links.js';

test('whitelisted protocols stay external links', () => {
  assert.deepEqual(resolveMarkdownLink('docs/a.md', 'https://example.com/x'), { kind: 'external', url: 'https://example.com/x' });
  assert.deepEqual(resolveMarkdownLink('docs/a.md', 'mailto:dev@example.com'), { kind: 'external', url: 'mailto:dev@example.com' });
  assert.equal(classifyMarkdownHref('HTTP://example.com'), 'external');
});

test('relative links resolve against the current file directory', () => {
  assert.deepEqual(resolveMarkdownLink('docs/guide/intro.md', '../api/types.ts'), { kind: 'repo-file', path: 'docs/api/types.ts' });
  assert.deepEqual(resolveMarkdownLink('README.md', './docs/a.md'), { kind: 'repo-file', path: 'docs/a.md' });
  assert.deepEqual(resolveMarkdownLink('docs/a.md', 'b/c.ts'), { kind: 'repo-file', path: 'docs/b/c.ts' });
});

test('root-relative links, query strings and encoding are normalized', () => {
  assert.deepEqual(resolveMarkdownLink('docs/a.md', '/src/main.tsx'), { kind: 'repo-file', path: 'src/main.tsx' });
  assert.deepEqual(resolveMarkdownLink('docs/a.md', './my%20file.md#section'), { kind: 'repo-file', path: 'docs/my file.md' });
  assert.deepEqual(resolveMarkdownLink('docs/a.md', './a.md?plain=1'), { kind: 'repo-file', path: 'docs/a.md' });
  assert.deepEqual(resolveMarkdownLink('docs\\win.md', '.\\sibling.md'), { kind: 'repo-file', path: 'docs/sibling.md' });
});

test('links leaving the repository or using unsafe protocols are ignored', () => {
  assert.deepEqual(resolveMarkdownLink('docs/a.md', '../../etc/passwd'), { kind: 'ignored' });
  assert.deepEqual(resolveMarkdownLink('README.md', 'javascript:alert(1)'), { kind: 'ignored' });
  assert.deepEqual(resolveMarkdownLink('README.md', 'data:text/html,<script>alert(1)</script>'), { kind: 'ignored' });
  assert.deepEqual(resolveMarkdownLink('README.md', 'C:\\Windows\\win.ini'), { kind: 'ignored' });
  assert.deepEqual(resolveMarkdownLink('README.md', '#section'), { kind: 'ignored' });
  assert.deepEqual(resolveMarkdownLink('README.md', '   '), { kind: 'ignored' });
});
