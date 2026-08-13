import test from 'node:test';
import assert from 'node:assert/strict';
import { createCommandConsoleSession } from './repo-command-console.js';
import type { CommandConsoleState } from './command-console-state.js';

function createConsoleState() {
  let current: CommandConsoleState | null = null;
  const setState = (next: CommandConsoleState | null | ((value: CommandConsoleState | null) => CommandConsoleState | null)) => {
    current = typeof next === 'function' ? next(current) : next;
  };
  return { get: () => current, setState };
}

test('keeps syncing a running command after its project changes', () => {
  const state = createConsoleState();
  const session = createCommandConsoleSession(state.setState, '组合', '生成 → 提交');

  session.appendLine('> 生成');
  session.appendLine('已生成');
  session.finish('success');

  assert.equal(state.get()?.output, '> 生成\n已生成');
  assert.equal(state.get()?.status, 'success');
});

test('an older command cannot overwrite a newer command console', () => {
  const state = createConsoleState();
  const older = createCommandConsoleSession(state.setState, '旧组合', '生成 → 提交');
  older.appendLine('旧步骤开始');
  const newer = createCommandConsoleSession(state.setState, '新命令', 'npm test');

  older.appendLine('旧步骤结束');
  older.finish('success');
  newer.appendLine('新命令输出');

  assert.equal(state.get()?.title, '新命令');
  assert.equal(state.get()?.output, '新命令输出');
});

test('clearing the console prevents a running command from reopening it', () => {
  const state = createConsoleState();
  const session = createCommandConsoleSession(state.setState, '命令', 'npm test');

  state.setState(null);
  session.appendLine('late output');
  session.finish('success');

  assert.equal(state.get(), null);
});
