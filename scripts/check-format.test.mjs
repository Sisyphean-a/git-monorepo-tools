import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkFormatting } from './check-format.mjs';

function fixture(t, files) {
  const temp = fileURLToPath(new URL('../.tmp/', import.meta.url));
  mkdirSync(temp, { recursive: true });
  const root = mkdtempSync(join(temp, 'check-format-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '--quiet', root]);
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, name)), { recursive: true });
    writeFileSync(join(root, name), content);
  }
  return root;
}

test('checks tracked and untracked source while preserving generated bindings and Markdown hard breaks', t => {
  const root = fixture(t, {
    'tracked.ts': 'export const a = 1;  \n',
    'untracked.js': 'const b = 2;\t\n',
    'frontend/wailsjs/go/models.ts': '\t\n',
    'README.md': 'hard break  \nnext line\n',
  });
  execFileSync('git', ['-c', 'core.autocrlf=false', 'add', 'tracked.ts'], { cwd: root });
  assert.deepEqual(checkFormatting(root), ['tracked.ts:1: 行尾空白', 'untracked.js:1: 行尾空白']);
});

test('reports gofmt and redundant EOF blank lines', t => {
  const root = fixture(t, { 'bad.go': 'package fixture\nfunc f( ){ }\n', 'bad.json': '{}\n\n' });
  const issues = checkFormatting(root);
  assert.ok(issues.some(issue => issue.endsWith('bad.go: 需要 gofmt')));
  assert.ok(issues.includes('bad.json: 文件末尾多余空行'));
});

test('accepts formatted source without changing files', t => {
  const root = fixture(t, { 'good.go': 'package fixture\n', 'good.ts': 'export const a = 1;\n' });
  assert.deepEqual(checkFormatting(root), []);
});

test('Go checkout stays formatted even when Git autocrlf is enabled', t => {
  const attributes = readFileSync(fileURLToPath(new URL('../.gitattributes', import.meta.url)), 'utf8');
  const root = fixture(t, { '.gitattributes': attributes, 'good.go': 'package fixture\n' });
  execFileSync('git', ['-c', 'core.autocrlf=true', 'add', 'good.go'], { cwd: root });
  unlinkSync(join(root, 'good.go'));
  execFileSync('git', ['-c', 'core.autocrlf=true', 'checkout', '--', 'good.go'], { cwd: root });
  assert.equal(readFileSync(join(root, 'good.go'), 'utf8'), 'package fixture\n');
  assert.deepEqual(checkFormatting(root), []);
});

test('allows deletion of a tracked source file', t => {
  const root = fixture(t, { 'deleted.go': 'package fixture\n' });
  execFileSync('git', ['-c', 'core.autocrlf=false', 'add', 'deleted.go'], { cwd: root });
  unlinkSync(join(root, 'deleted.go'));
  assert.deepEqual(checkFormatting(root), []);
});
