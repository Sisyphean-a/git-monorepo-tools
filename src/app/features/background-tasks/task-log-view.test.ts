import test from 'node:test';
import assert from 'node:assert/strict';
import { createTaskLogView, type TaskLogView } from './task-log-view.js';
import { TASK_LOG_BYTES, type BackgroundTaskLog } from '../../domain/background-task.js';

function scheduler() {
  const callbacks = new Map<number, () => void>();
  const delays: number[] = [];
  let id = 0;
  return {
    callbacks, delays,
    schedule: ((callback: () => void, delay: number) => {
      callbacks.set(++id, callback); delays.push(delay);
      return id;
    }) as unknown as typeof setTimeout,
    cancel: ((timer: number) => { callbacks.delete(timer); }) as unknown as typeof clearTimeout,
    tick() {
      const next = callbacks.entries().next().value;
      if (next) { callbacks.delete(next[0]); next[1](); }
    },
  };
}

test('visible log reads only increments, bounds UTF-8 bytes and reports discarded history', async () => {
  const timers = scheduler();
  const cursors: number[] = [];
  const views: TaskLogView[] = [];
  const results: BackgroundTaskLog[] = [
    { text: 'start\n', cursor: 6, reset: true, truncated: false },
    { text: '中'.repeat(TASK_LOG_BYTES), cursor: TASK_LOG_BYTES * 3 + 6, reset: false, truncated: true },
    { text: 'fresh', cursor: 5, reset: true, truncated: false },
  ];
  const view = createTaskLogView({
    read: async cursor => { cursors.push(cursor); return results.shift()!; },
    onView: next => views.push(next), onError: () => {}, repeat: true, ...timers,
  });
  await view.refresh();
  await view.refresh();
  assert.deepEqual(cursors, [-1, 6]);
  assert.ok(new TextEncoder().encode(views.at(-1)!.text).length <= TASK_LOG_BYTES);
  assert.equal(views.at(-1)!.truncated, true);
  assert.ok(!views.at(-1)!.text.includes('�'));
  await view.refresh();
  assert.deepEqual(views.at(-1), { text: 'fresh', truncated: false });
  assert.ok(timers.delays.every(delay => delay === 250));
  view.dispose();
  assert.equal(timers.callbacks.size, 0);
});

test('closing or changing task cancels scheduling and ignores an in-flight response', async () => {
  const timers = scheduler();
  let resolve!: (value: BackgroundTaskLog) => void;
  let calls = 0;
  const views: TaskLogView[] = [];
  const view = createTaskLogView({
    read: () => { calls++; return new Promise(done => { resolve = done; }); },
    onView: next => views.push(next), onError: () => {}, repeat: true, ...timers,
  });
  const pending = view.refresh();
  await view.refresh();
  assert.equal(calls, 1);
  view.dispose();
  resolve({ text: 'late output', cursor: 11, reset: true, truncated: false });
  await pending;
  await view.refresh();
  assert.deepEqual(views, []);
  assert.equal(calls, 1);
  assert.equal(timers.callbacks.size, 0);
});

test('ended tasks read the final tail once and failures remain explicit', async () => {
  const timers = scheduler();
  const failures: (string | null)[] = [];
  const view = createTaskLogView({
    read: async () => { throw 'Wails log read failure'; },
    onView: () => {}, onError: error => failures.push(error), repeat: false, ...timers,
  });
  await view.refresh();
  assert.deepEqual(failures, ['Wails log read failure']);
  assert.equal(timers.callbacks.size, 0);
  view.dispose();
});

test('unchanged output does not rebuild the displayed log', async () => {
  let changes = 0;
  const view = createTaskLogView({
    read: async () => ({ text: '', cursor: 0, reset: false, truncated: false }),
    onView: () => { changes++; }, onError: () => {}, repeat: false,
  });
  await view.refresh();
  await view.refresh();
  assert.equal(changes, 1);
  view.dispose();
});
