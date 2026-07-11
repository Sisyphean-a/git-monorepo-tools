import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getWindowsTerminalShortcutAction,
  handleWindowsTerminalShortcutEvent,
  pasteTerminalClipboard,
  powerShellAddLineSequence,
  queueTerminalInput,
} from './repo-terminal-shortcuts.js';

test('windows ctrl+c copies when terminal selection exists', () => {
  assert.equal(getWindowsTerminalShortcutAction({
    type: 'keydown',
    ctrlKey: true,
    altKey: false,
    metaKey: false,
    key: 'c',
  }, true, 'Win32'), 'copy-selection');
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

test('windows shift+enter selects the insert-line action', () => {
  const event = {
    type: 'keydown',
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    shiftKey: true,
    key: 'Enter',
  } as unknown as Parameters<typeof getWindowsTerminalShortcutAction>[0];

  assert.equal(getWindowsTerminalShortcutAction(event, false, 'Win32'), 'insert-line');
});

test('windows shift+enter inserts one line and prevents default handling', () => {
  let insertLineCalls = 0;
  let insertLineData: string | undefined;
  const event = {
    type: 'keydown',
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    shiftKey: true,
    key: 'Enter',
  } as unknown as Parameters<typeof handleWindowsTerminalShortcutEvent>[0];
  const bindings = {
    hasSelection: () => false,
    copySelection: () => {},
    insertLine: (data: string) => {
      insertLineCalls += 1;
      insertLineData = data;
    },
    pasteClipboard: () => {},
  } as unknown as Parameters<typeof handleWindowsTerminalShortcutEvent>[1];

  const allowsDefault = handleWindowsTerminalShortcutEvent(event, bindings, 'Win32');

  assert.equal(allowsDefault, false);
  assert.equal(insertLineCalls, 1);
  assert.equal(insertLineData, powerShellAddLineSequence);
});

test('windows shift+enter keypress prevents default handling without inserting a second line', () => {
  let insertLineCalls = 0;
  const event = {
    type: 'keypress',
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    shiftKey: true,
    key: 'Enter',
  } as unknown as Parameters<typeof handleWindowsTerminalShortcutEvent>[0];
  const bindings = {
    hasSelection: () => false,
    copySelection: () => {},
    insertLine: () => {
      insertLineCalls += 1;
    },
    pasteClipboard: () => {},
  } as unknown as Parameters<typeof handleWindowsTerminalShortcutEvent>[1];

  const allowsDefault = handleWindowsTerminalShortcutEvent(event, bindings, 'Win32');

  assert.equal(allowsDefault, false);
  assert.equal(insertLineCalls, 0);
});

test('windows shift+enter keydown and keypress send one proxy sequence', () => {
  const sent: string[] = [];
  const bindings = {
    hasSelection: () => false,
    copySelection: () => {},
    insertLine: (data: string) => {
      sent.push(data);
    },
    pasteClipboard: () => {},
  } as unknown as Parameters<typeof handleWindowsTerminalShortcutEvent>[1];
  const keydown = {
    type: 'keydown',
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    shiftKey: true,
    key: 'Enter',
  } as unknown as Parameters<typeof handleWindowsTerminalShortcutEvent>[0];
  const keypress = { ...keydown, type: 'keypress' };

  assert.equal(handleWindowsTerminalShortcutEvent(keydown, bindings, 'Win32'), false);
  assert.equal(handleWindowsTerminalShortcutEvent(keypress, bindings, 'Win32'), false);
  assert.deepEqual(sent, [powerShellAddLineSequence]);
});

test('windows ctrl+shift+enter passes through to terminal', () => {
  assert.equal(getWindowsTerminalShortcutAction({
    type: 'keydown',
    ctrlKey: true,
    altKey: false,
    metaKey: false,
    shiftKey: true,
    key: 'Enter',
  }, false, 'Win32'), 'pass-through');
});

test('windows alt+shift+enter passes through to terminal', () => {
  assert.equal(getWindowsTerminalShortcutAction({
    type: 'keydown',
    ctrlKey: false,
    altKey: true,
    metaKey: false,
    shiftKey: true,
    key: 'Enter',
  }, false, 'Win32'), 'pass-through');
});

test('windows meta+shift+enter passes through to terminal', () => {
  assert.equal(getWindowsTerminalShortcutAction({
    type: 'keydown',
    ctrlKey: false,
    altKey: false,
    metaKey: true,
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
  const allowsDefault = handleWindowsTerminalShortcutEvent({
    type: 'keydown',
    ctrlKey: true,
    altKey: false,
    metaKey: false,
    key: 'V',
  }, {
    hasSelection: () => false,
    copySelection: () => {},
    pasteClipboard: () => {
      pasteCalls += 1;
    },
  }, 'Win32');

  assert.equal(allowsDefault, false);
  assert.equal(pasteCalls, 1);
});

test('application clipboard paste preserves terminal-transformed text', async () => {
  let clipboardReads = 0;
  const transformed: string[] = [];
  const pasted: string[] = [];

  const pastedClipboard = await pasteTerminalClipboard(async () => {
    clipboardReads += 1;
    return 'first line\nsecond line';
  }, text => {
    transformed.push(text);
    return `\x1b[200~${text.replace('\n', '\r')}\x1b[201~`;
  }, async text => {
    pasted.push(text);
  });

  assert.equal(pastedClipboard, true);
  assert.equal(clipboardReads, 1);
  assert.deepEqual(transformed, ['first line\nsecond line']);
  assert.deepEqual(pasted, ['\x1b[200~first line\rsecond line\x1b[201~']);
});

test('terminal input queue sends the PowerShell add-line sequence before enter', async () => {
  const writes: string[] = [];
  let startFirstWrite!: () => void;
  let releaseFirstWrite!: () => void;
  const firstWriteStarted = new Promise<void>(resolve => {
    startFirstWrite = resolve;
  });
  const firstWriteReleased = new Promise<void>(resolve => {
    releaseFirstWrite = resolve;
  });
  const writeInput = async (data: string) => {
    if (data === powerShellAddLineSequence) {
      startFirstWrite();
      await firstWriteReleased;
    }
    writes.push(data);
  };

  let inputQueue = queueTerminalInput(Promise.resolve(), writeInput, powerShellAddLineSequence);
  await firstWriteStarted;
  inputQueue = queueTerminalInput(inputQueue, writeInput, '\r');
  releaseFirstWrite();
  await inputQueue;

  assert.deepEqual(writes, [powerShellAddLineSequence, '\r']);
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
