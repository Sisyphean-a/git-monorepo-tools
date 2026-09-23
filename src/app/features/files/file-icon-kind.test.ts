import assert from 'node:assert/strict';
import test from 'node:test';
import { fileIconKind, folderIconColor } from './file-icon-kind.js';

test('file icons distinguish common source, document, asset and git files', () => {
  assert.deepEqual(fileIconKind('app.tsx'), { kind: 'badge', label: 'TS', color: '#fff', background: '#3178c6' });
  assert.deepEqual(fileIconKind('data.json'), { kind: 'badge', label: '{}', color: '#fff', background: '#7bac3b' });
  assert.deepEqual(fileIconKind('package.json'), { kind: 'badge', label: 'JS', color: '#fff', background: '#76a642' });
  assert.equal(fileIconKind('tsconfig.base.json').kind, 'badge');
  assert.equal(fileIconKind('AGENTS.md').kind, 'robot');
  assert.equal(fileIconKind('README.md').kind, 'markdown');
  assert.equal(fileIconKind('.gitignore').kind, 'git');
  assert.equal(fileIconKind('logo.svg').kind, 'image');
  assert.equal(fileIconKind('LICENSE').kind, 'file');
  assert.notEqual(folderIconColor('docs'), folderIconColor('node_modules'));
});
