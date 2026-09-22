import test from 'node:test';
import assert from 'node:assert/strict';
import { createCommandTerminators } from './command-terminators.js';

test('terminate reaches only the registered command of that repo', async () => {
  const terminators = createCommandTerminators();
  const calls: string[] = [];
  terminators.register('A', async () => { calls.push('A'); });
  terminators.register('B', async () => { calls.push('B'); });

  await terminators.terminate('A');

  assert.deepEqual(calls, ['A']);
});

test('terminate rejects when the repo has no running command', async () => {
  const terminators = createCommandTerminators();

  await assert.rejects(() => terminators.terminate('A'), /当前没有正在运行的命令/);
});

test('a cleared terminator is no longer reachable', async () => {
  const terminators = createCommandTerminators();
  const calls: string[] = [];
  terminators.register('A', async () => { calls.push('A'); });
  terminators.clear('A');

  await assert.rejects(() => terminators.terminate('A'));
  assert.deepEqual(calls, []);
});

test('terminator failures reach the caller so the button can recover', async () => {
  const terminators = createCommandTerminators();
  terminators.register('A', () => Promise.reject(new Error('命令已结束或不存在')));

  await assert.rejects(() => terminators.terminate('A'), /命令已结束或不存在/);
});
