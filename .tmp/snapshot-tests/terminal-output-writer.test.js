import test from 'node:test';
import assert from 'node:assert/strict';
import { TerminalOutputWriter } from './terminal-output-writer.js';
function createManualScheduler() {
    let nextHandle = 1;
    const tasks = new Map();
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
                const [handle, callback] = tasks.entries().next().value;
                tasks.delete(handle);
                callback();
            }
        },
    };
}
test('terminal output writer preserves output while batching writes', () => {
    const writes = [];
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
    const writes = [];
    const scheduler = createManualScheduler();
    const writer = new TerminalOutputWriter({
        write(data, callback) {
            writes.push(data);
            callback?.();
        },
    }, {
        scheduler,
        maxWriteChars: 4096,
        compactThreshold: 8,
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
    const writes = [];
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
test('terminal output writer can pause and resume without losing queued output', () => {
    const writes = [];
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
    writer.setEnabled(false);
    writer.enqueue('one');
    writer.enqueue('two');
    scheduler.flushAll();
    assert.deepEqual(writes, []);
    writer.setEnabled(true);
    scheduler.flushAll();
    assert.deepEqual(writes, ['onetwo']);
});
test('terminal output writer trims hidden backlog to bounded tail', () => {
    const writes = [];
    const scheduler = createManualScheduler();
    const writer = new TerminalOutputWriter({
        write(data, callback) {
            writes.push(data);
            callback?.();
        },
    }, {
        scheduler,
        maxWriteChars: 1024,
        maxBufferedChars: 2048,
        maxDisabledBufferedChars: 1024,
    });
    const chunks = Array.from({ length: 160 }, (_, index) => `chunk-${index.toString().padStart(4, '0')}\n`);
    writer.setEnabled(false);
    for (const chunk of chunks) {
        writer.enqueue(chunk);
    }
    scheduler.flushAll();
    assert.deepEqual(writes, []);
    writer.setEnabled(true);
    scheduler.flushAll();
    const payload = writes.join('');
    assert.match(payload, /older terminal output skipped/);
    assert.match(payload, /chunk-0159/);
    assert.ok(!payload.includes('chunk-0000'));
});
