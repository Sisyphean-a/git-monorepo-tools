import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ctrlJInput,
  ctrlVInput,
  ctrlWInput,
  getWindowsTerminalShortcutAction,
  handleWindowsTerminalShortcutEvent,
  pasteTerminalClipboard,
  piClipboardInput,
  queueTerminalInput,
  shiftEnterInput,
} from './repo-terminal-shortcuts.js';

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
    pasteClipboard: () => {},
    writeInput: () => {},
  }, 'Win32');

  assert.equal(allowsDefault, false);
  assert.equal(copyCalls, 1);
  assert.equal(preventDefaultCalls, 0);
});

test('windows ctrl+c without selection passes through to terminal', () => {
  assert.deepEqual(getWindowsTerminalShortcutAction({
    type: 'keydown',
    ctrlKey: true,
    altKey: false,
    metaKey: false,
    key: 'c',
  }, false, 'Win32'), { type: 'pass-through' });
});

test('windows shift+enter sends Pi newline input without enhanced keyboard negotiation', () => {
  assert.deepEqual(getWindowsTerminalShortcutAction({
    type: 'keydown',
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    shiftKey: true,
    key: 'Enter',
  }, false, 'Win32'), { type: 'send-input', input: shiftEnterInput });
});

test('windows enter passes through to terminal', () => {
  assert.deepEqual(getWindowsTerminalShortcutAction({
    type: 'keydown',
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    shiftKey: false,
    key: 'Enter',
  }, false, 'Win32'), { type: 'pass-through' });
});

test('non-windows shift+enter passes through to terminal', () => {
  assert.deepEqual(getWindowsTerminalShortcutAction({
    type: 'keydown',
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    shiftKey: true,
    key: 'Enter',
  }, false, 'MacIntel'), { type: 'pass-through' });
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
    copySelection: () => {},
    pasteClipboard: () => {
      pasteCalls += 1;
    },
    writeInput: () => {},
  }, 'Win32');

  assert.equal(allowsDefault, false);
  assert.equal(preventDefaultCalls, 1);
  assert.equal(pasteCalls, 1);
});

test('windows alt+v invokes application paste and prevents default handling', () => {
  let pasteCalls = 0;
  let preventDefaultCalls = 0;
  const allowsDefault = handleWindowsTerminalShortcutEvent({
    type: 'keydown',
    ctrlKey: false,
    altKey: true,
    metaKey: false,
    key: 'V',
    preventDefault: () => {
      preventDefaultCalls += 1;
    },
  }, {
    hasSelection: () => false,
    copySelection: () => {},
    pasteClipboard: () => {
      pasteCalls += 1;
    },
    writeInput: () => {},
  }, 'Win32');

  assert.equal(allowsDefault, false);
  assert.equal(preventDefaultCalls, 1);
  assert.equal(pasteCalls, 1);
});

test('windows application and compatibility shortcuts write their mapped input', () => {
  const writes: string[] = [];
  let preventDefaultCalls = 0;
  const bindings = {
    hasSelection: () => false,
    copySelection: () => {},
    pasteClipboard: () => {},
    writeInput: (input: string) => {
      writes.push(input);
    },
  };

  const shiftEnterAllowed = handleWindowsTerminalShortcutEvent({
    type: 'keydown',
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    shiftKey: true,
    key: 'Enter',
    preventDefault: () => {
      preventDefaultCalls += 1;
    },
  }, bindings, 'Win32');
  const ctrlJAllowed = handleWindowsTerminalShortcutEvent({
    type: 'keydown',
    ctrlKey: true,
    altKey: false,
    metaKey: false,
    key: 'j',
    preventDefault: () => {
      preventDefaultCalls += 1;
    },
  }, bindings, 'Win32');
  const ctrlBackspaceAllowed = handleWindowsTerminalShortcutEvent({
    type: 'keydown',
    ctrlKey: true,
    altKey: false,
    metaKey: false,
    shiftKey: false,
    key: 'Backspace',
    preventDefault: () => {
      preventDefaultCalls += 1;
    },
  }, bindings, 'Win32');

  assert.equal(shiftEnterAllowed, false);
  assert.equal(ctrlJAllowed, false);
  assert.equal(ctrlBackspaceAllowed, false);
  assert.equal(preventDefaultCalls, 3);
  assert.deepEqual(writes, [shiftEnterInput, ctrlJInput, ctrlWInput]);
  assert.equal(shiftEnterInput, ctrlJInput);
});

test('application clipboard text paste checks for an image before preserving terminal-transformed text', async () => {
  let clipboardReads = 0;
  let imageReads = 0;
  const transformed: string[] = [];
  const pasted: string[] = [];

  const pastedClipboard = await pasteTerminalClipboard({
    source: 'context-menu',
    getClipboardImagePath: async () => {
      imageReads += 1;
      return null;
    },
    getClipboardText: async () => {
      clipboardReads += 1;
      return 'first line\nsecond line';
    },
    transformPastedText: text => {
      transformed.push(text);
      return `\x1b[200~${text.replace('\n', '\r')}\x1b[201~`;
    },
    writeInput: async text => {
      pasted.push(text);
    },
  });

  assert.equal(pastedClipboard, true);
  assert.equal(imageReads, 1);
  assert.equal(clipboardReads, 1);
  assert.deepEqual(transformed, ['first line\nsecond line']);
  assert.deepEqual(pasted, ['\x1b[200~first line\rsecond line\x1b[201~']);
});

test('confirmed Pi sessions delegate clipboard paste to Pi without reading or transforming it in the application', async () => {
  const pasted: string[] = [];

  const pastedClipboard = await pasteTerminalClipboard({
    source: 'keyboard',
    delegateToPiClipboard: true,
    getClipboardImagePath: () => assert.fail('Pi must own image clipboard reads'),
    getClipboardText: () => assert.fail('Pi must own text clipboard reads'),
    transformPastedText: () => assert.fail('Pi must not receive ConPTY-stripped paste markers'),
    writeInput: async text => {
      pasted.push(text);
    },
  });

  assert.equal(pastedClipboard, true);
  assert.deepEqual(pasted, [piClipboardInput]);
  assert.equal(piClipboardInput, '\x1b[27;3;118~');
});

test('application clipboard image paste writes its temporary path after text lookup finds nothing', async () => {
  const pasted: string[] = [];

  const pastedClipboard = await pasteTerminalClipboard({
    source: 'keyboard',
    getClipboardImagePath: async () => 'C:\\Users\\tester\\AppData\\Local\\Temp\\pi-clipboard-test.png',
    getClipboardText: async () => '',
    transformPastedText: () => assert.fail('image paste must not transform clipboard text'),
    writeInput: async text => {
      pasted.push(text);
    },
  });

  assert.equal(pastedClipboard, true);
  assert.deepEqual(pasted, ['C:\\Users\\tester\\AppData\\Local\\Temp\\pi-clipboard-test.png']);
});

test('keyboard paste forwards ctrl+v when the clipboard has no text', async () => {
  const pasted: string[] = [];

  const pastedClipboard = await pasteTerminalClipboard({
    source: 'keyboard',
    getClipboardText: async () => '',
    transformPastedText: () => assert.fail('empty clipboard must not be transformed'),
    writeInput: async text => {
      pasted.push(text);
    },
  });

  assert.equal(pastedClipboard, true);
  assert.deepEqual(pasted, [ctrlVInput]);
});

test('keyboard paste forwards ctrl+v when clipboard text cannot be read', async () => {
  const pasted: string[] = [];

  const pastedClipboard = await pasteTerminalClipboard({
    source: 'keyboard',
    getClipboardText: async () => {
      throw new Error('clipboard text unavailable');
    },
    transformPastedText: () => assert.fail('unreadable clipboard must not be transformed'),
    writeInput: async text => {
      pasted.push(text);
    },
  });

  assert.equal(pastedClipboard, true);
  assert.deepEqual(pasted, [ctrlVInput]);
});

test('clipboard paste without a fallback ignores empty text', async () => {
  const pasted: string[] = [];

  const pastedClipboard = await pasteTerminalClipboard({
    source: 'context-menu',
    getClipboardText: async () => '',
    transformPastedText: () => assert.fail('empty clipboard must not be transformed'),
    writeInput: async text => {
      pasted.push(text);
    },
  });

  assert.equal(pastedClipboard, false);
  assert.deepEqual(pasted, []);
});

test('clipboard paste without a fallback preserves read failures', async () => {
  const pasted: string[] = [];

  await assert.rejects(() => pasteTerminalClipboard({
    source: 'context-menu',
    getClipboardText: async () => {
      throw new Error('clipboard read failed');
    },
    transformPastedText: () => assert.fail('unreadable clipboard must not be transformed'),
    writeInput: async text => {
      pasted.push(text);
    },
  }), /clipboard read failed/);

  assert.deepEqual(pasted, []);
});

test('terminal input queue preserves write order', async () => {
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

test('standard terminal shortcuts pass through to xterm', () => {
  for (const key of ['ArrowLeft', 'ArrowRight']) {
    assert.deepEqual(getWindowsTerminalShortcutAction({
      type: 'keydown',
      ctrlKey: true,
      altKey: false,
      metaKey: false,
      key,
    }, false, 'Win32'), { type: 'pass-through' });
  }
});

test('non-windows platforms keep default terminal shortcuts', () => {
  assert.deepEqual(getWindowsTerminalShortcutAction({
    type: 'keydown',
    ctrlKey: true,
    altKey: false,
    metaKey: false,
    key: 'v',
  }, false, 'MacIntel'), { type: 'pass-through' });
});

test('shortcut matching requires the complete Windows modifier profile', () => {
  const strictWindowsRules = [
    { key: 'Enter', ctrlKey: true, altKey: false, metaKey: false, shiftKey: true },
    { key: 'j', ctrlKey: true, altKey: true, metaKey: false, shiftKey: false },
    { key: 'Backspace', ctrlKey: true, altKey: false, metaKey: true, shiftKey: false },
    { key: 'v', ctrlKey: true, altKey: false, metaKey: true, shiftKey: false },
  ];

  for (const event of strictWindowsRules) {
    assert.deepEqual(getWindowsTerminalShortcutAction({ type: 'keydown', ...event }, false, 'Win64'), { type: 'pass-through' });
  }
});

test('only Windows platform labels activate the Pi shortcut profile', () => {
  const event = {
    type: 'keydown',
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    shiftKey: true,
    key: 'Enter',
  };

  assert.deepEqual(getWindowsTerminalShortcutAction(event, false, 'Windows'), { type: 'send-input', input: shiftEnterInput });
  for (const platform of ['', 'Linux x86_64', 'MacIntel']) {
    assert.deepEqual(getWindowsTerminalShortcutAction(event, false, platform), { type: 'pass-through' });
  }
});
