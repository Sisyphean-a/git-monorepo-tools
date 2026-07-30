import test from 'node:test';
import assert from 'node:assert/strict';
import { TerminalOutputWriter, type TerminalOutputScheduler } from './terminal-output-writer.js';

function createManualScheduler(): TerminalOutputScheduler & { flushAll: () => void } {
  let nextHandle = 1;
  const tasks = new Map<number, () => void>();

  return {
    schedule(callback) {
      const handle = nextHandle++;
      tasks.set(handle, callback);
      return handle;
    },
    cancel(handle) {
      tasks.delete(handle);
    },
    flushAll() {
      while (tasks.size > 0) {
        const [handle, callback] = tasks.entries().next().value as [number, () => void];
        tasks.delete(handle);
        callback();
      }
    },
  };
}

test('terminal output writer preserves output while batching writes', () => {
  const writes: string[] = [];
  const scheduler = createManualScheduler();
  const writer = new TerminalOutputWriter({
    write(data, callback) {
      writes.push(data);
      callback?.();
    },
  }, {
    scheduler,
    maxWriteChars: 8,
  });

  writer.enqueue('ab');
  writer.enqueue('cd');
  writer.enqueue('ef');
  writer.enqueue('gh');
  scheduler.flushAll();

  assert.deepEqual(writes, ['abcdefgh']);
});

test('terminal output writer pressure test collapses many events into few writes', () => {
  const writes: string[] = [];
  const scheduler = createManualScheduler();
  const writer = new TerminalOutputWriter({
    write(data, callback) {
      writes.push(data);
      callback?.();
    },
  }, {
    scheduler,
    maxWriteChars: 4096,
  });

  let expected = '';
  for (let i = 0; i < 5000; i++) {
    const chunk = `line-${i}\n`;
    expected += chunk;
    writer.enqueue(chunk);
  }
  scheduler.flushAll();

  assert.ok(writes.length < 20, `expected fewer than 20 writes, got ${writes.length}`);
  assert.equal(writes.join(''), expected);
});

test('terminal output writer reset drops pending buffered output', () => {
  const writes: string[] = [];
  const scheduler = createManualScheduler();
  const writer = new TerminalOutputWriter({
    write(data, callback) {
      writes.push(data);
      callback?.();
    },
  }, {
    scheduler,
  });

  writer.enqueue('before-reset');
  writer.reset();
  scheduler.flushAll();
  writer.enqueue('after-reset');
  scheduler.flushAll();

  assert.deepEqual(writes, ['after-reset']);
});

test('terminal output writer preserves more than the former 512KB output limit', () => {
  let visibleOutput = '';
  const scheduler = createManualScheduler();
  const writer = new TerminalOutputWriter({
    write(data, callback) {
      visibleOutput += data;
      callback?.();
    },
  }, {
    scheduler,
    maxWriteChars: 1024,
  });

  const beforeSwitch = 'before-switch\n';
  const queuedOutput = Array.from(
    { length: 640 },
    (_, index) => `chunk-${index.toString().padStart(4, '0')}:${'x'.repeat(1024)}\n`,
  ).join('');
  assert.ok(queuedOutput.length > 512 * 1024);

  writer.enqueue(beforeSwitch);
  scheduler.flushAll();
  writer.enqueue(queuedOutput);
  scheduler.flushAll();

  assert.equal(visibleOutput, beforeSwitch + queuedOutput);
});
