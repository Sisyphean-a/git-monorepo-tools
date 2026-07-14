import test from 'node:test';
import assert from 'node:assert/strict';
import { getWindowsTerminalShortcutAction, handleWindowsTerminalShortcutEvent, pasteTerminalClipboard, queueTerminalInput, } from './repo-terminal-shortcuts.js';
test('windows ctrl+c copies selection without blocking browser fallback', () => {
    let copyCalls = 0;
    let preventDefaultCalls = 0;
    const allowsDefault = handleWindowsTerminalShortcutEvent({
        type: 'keydown',
        ctrlKey: true,
        altKey: false,
        metaKey: false,
        key: 'c',
        preventDefault: () => {
            preventDefaultCalls += 1;
        },
    }, {
        hasSelection: () => true,
        copySelection: () => {
            copyCalls += 1;
        },
        pasteClipboard: () => { },
    }, 'Win32');
    assert.equal(allowsDefault, false);
    assert.equal(copyCalls, 1);
    assert.equal(preventDefaultCalls, 0);
});
test('windows ctrl+c without selection passes through to terminal', () => {
    assert.equal(getWindowsTerminalShortcutAction({
        type: 'keydown',
        ctrlKey: true,
        altKey: false,
        metaKey: false,
        key: 'c',
    }, false, 'Win32'), 'pass-through');
});
test('windows shift+enter passes through to terminal', () => {
    assert.equal(getWindowsTerminalShortcutAction({
        type: 'keydown',
        ctrlKey: false,
        altKey: false,
        metaKey: false,
        shiftKey: true,
        key: 'Enter',
    }, false, 'Win32'), 'pass-through');
});
test('windows enter passes through to terminal', () => {
    assert.equal(getWindowsTerminalShortcutAction({
        type: 'keydown',
        ctrlKey: false,
        altKey: false,
        metaKey: false,
        shiftKey: false,
        key: 'Enter',
    }, false, 'Win32'), 'pass-through');
});
test('non-windows shift+enter passes through to terminal', () => {
    assert.equal(getWindowsTerminalShortcutAction({
        type: 'keydown',
        ctrlKey: false,
        altKey: false,
        metaKey: false,
        shiftKey: true,
        key: 'Enter',
    }, false, 'MacIntel'), 'pass-through');
});
test('windows ctrl+v invokes application paste and prevents default handling', () => {
    let pasteCalls = 0;
    let preventDefaultCalls = 0;
    const allowsDefault = handleWindowsTerminalShortcutEvent({
        type: 'keydown',
        ctrlKey: true,
        altKey: false,
        metaKey: false,
        key: 'V',
        preventDefault: () => {
            preventDefaultCalls += 1;
        },
    }, {
        hasSelection: () => false,
        copySelection: () => { },
        pasteClipboard: () => {
            pasteCalls += 1;
        },
    }, 'Win32');
    assert.equal(allowsDefault, false);
    assert.equal(preventDefaultCalls, 1);
    assert.equal(pasteCalls, 1);
});
test('application clipboard paste preserves terminal-transformed text', async () => {
    let clipboardReads = 0;
    const transformed = [];
    const pasted = [];
    const pastedClipboard = await pasteTerminalClipboard(async () => {
        clipboardReads += 1;
        return 'first line\nsecond line';
    }, text => {
        transformed.push(text);
        return `\x1b[200~${text.replace('\n', '\r')}\x1b[201~`;
    }, async (text) => {
        pasted.push(text);
    });
    assert.equal(pastedClipboard, true);
    assert.equal(clipboardReads, 1);
    assert.deepEqual(transformed, ['first line\nsecond line']);
    assert.deepEqual(pasted, ['\x1b[200~first line\rsecond line\x1b[201~']);
});
test('terminal input queue preserves write order', async () => {
    const writes = [];
    let startFirstWrite;
    let releaseFirstWrite;
    const firstWriteStarted = new Promise(resolve => {
        startFirstWrite = resolve;
    });
    const firstWriteReleased = new Promise(resolve => {
        releaseFirstWrite = resolve;
    });
    const writeInput = async (data) => {
        if (data === 'first') {
            startFirstWrite();
            await firstWriteReleased;
        }
        writes.push(data);
    };
    let inputQueue = queueTerminalInput(Promise.resolve(), writeInput, 'first');
    await firstWriteStarted;
    inputQueue = queueTerminalInput(inputQueue, writeInput, 'second');
    releaseFirstWrite();
    await inputQueue;
    assert.deepEqual(writes, ['first', 'second']);
});
test('non-windows platforms keep default terminal shortcuts', () => {
    assert.equal(getWindowsTerminalShortcutAction({
        type: 'keydown',
        ctrlKey: true,
        altKey: false,
        metaKey: false,
        key: 'v',
    }, false, 'MacIntel'), 'pass-through');
});
