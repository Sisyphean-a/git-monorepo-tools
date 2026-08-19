import test from 'node:test';
import assert from 'node:assert/strict';
import { appendCommandOutput, createCommandConsoleSession, MAX_COMMAND_OUTPUT_CHARS } from './repo-command-console.js';
import type { CommandConsoleState } from './command-console-state.js';
import type { CommandConsoleUpdater } from './repo-command-console.js';

function createConsoleStore() {
  const store: Record<string, CommandConsoleState | null> = {};
  const updateRepo = (repoId: string) => (updater: CommandConsoleUpdater) => {
    store[repoId] = updater(store[repoId] ?? null);
  };
  return { store, updateRepo };
}

test('sessions of different repos do not overwrite each other', () => {
  const { store, updateRepo } = createConsoleStore();
  const projectA = createCommandConsoleSession('A', updateRepo('A'), '组合', '生成 → 提交');
  const projectB = createCommandConsoleSession('B', updateRepo('B'), '自定义命令', 'npm test');

  projectA.appendLine('> 生成');
  projectA.appendLine('已生成');
  projectB.appendLine('测试输出');
  projectA.finish('success');
  projectB.finish('success');

  assert.equal(store['A']?.output, '> 生成\n已生成');
  assert.equal(store['A']?.status, 'success');
  assert.equal(store['A']?.title, '组合');
  assert.equal(store['B']?.output, '测试输出');
  assert.equal(store['B']?.title, '自定义命令');
});

test('an older command cannot overwrite a newer command console of the same repo', () => {
  const { store, updateRepo } = createConsoleStore();
  const older = createCommandConsoleSession('A', updateRepo('A'), '旧组合', '生成 → 提交');
  older.appendLine('旧步骤开始');
  const newer = createCommandConsoleSession('A', updateRepo('A'), '新命令', 'npm test');

  older.appendLine('旧步骤结束');
  older.finish('success');
  newer.appendLine('新命令输出');

  assert.equal(store['A']?.title, '新命令');
  assert.equal(store['A']?.output, '新命令输出');
});

test('clearing the console prevents a running command from reopening it', () => {
  const { store, updateRepo } = createConsoleStore();
  const session = createCommandConsoleSession('A', updateRepo('A'), '命令', 'npm test');

  store['A'] = null;
  session.appendLine('late output');
  session.finish('success');

  assert.equal(store['A'], null);
});

test('switching projects keeps each repo output retained (no reset on project change)', () => {
  const { store, updateRepo } = createConsoleStore();
  const projectA = createCommandConsoleSession('A', updateRepo('A'), '组合', '生成 → 提交');
  projectA.appendLine('A 的输出内容');
  projectA.finish('success');

  // 切换到项目 B，A 的会话仍然保留在 A 的槽位
  const projectB = createCommandConsoleSession('B', updateRepo('B'), '自定义命令', 'npm test');
  projectB.appendLine('B 的输出内容');

  assert.equal(store['A']?.output, 'A 的输出内容');
  assert.equal(store['B']?.output, 'B 的输出内容');
});

test('command output keeps only the tail once it exceeds the cap and marks itself truncated', () => {
  const { store, updateRepo } = createConsoleStore();
  const session = createCommandConsoleSession('A', updateRepo('A'), '命令', 'npm test');

  const head = 'a'.repeat(MAX_COMMAND_OUTPUT_CHARS);
  const tail = 'tail-data';
  session.write(head);
  session.write(tail);
  session.finish('success');

  const current = store['A'];
  assert.equal(current?.truncated, true);
  assert.equal(current?.output.length, MAX_COMMAND_OUTPUT_CHARS);
  assert.ok(current?.output.endsWith(tail));
});

test('truncation flag survives later writes without growing the output', () => {
  const { store, updateRepo } = createConsoleStore();
  const session = createCommandConsoleSession('A', updateRepo('A'), '命令', 'npm test');

  session.write('x'.repeat(MAX_COMMAND_OUTPUT_CHARS + 1));
  session.write('more output');
  session.finish('success');

  const current = store['A'];
  assert.equal(current?.truncated, true);
  assert.equal(current?.output.length, MAX_COMMAND_OUTPUT_CHARS);
  assert.ok(current?.output.endsWith('more output'));
});

test('appendCommandOutput leaves short output untouched', () => {
  const appended = appendCommandOutput('abc', 'def');
  assert.equal(appended.output, 'abcdef');
  assert.equal(appended.truncated, false);
});