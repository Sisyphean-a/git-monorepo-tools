import test from 'node:test';
import assert from 'node:assert/strict';
import {
  describeTerminalKeyboardEvent,
  describeTerminalShortcutAction,
  formatTerminalInputTrace,
} from './terminal-input-trace.js';

test('input trace preserves the Shift+Enter event and Pi protocol sequence', () => {
  const keyboardEvent = describeTerminalKeyboardEvent({
    type: 'keydown',
    key: 'Enter',
    code: 'Enter',
    ctrlKey: false,
    altKey: false,
    shiftKey: true,
    metaKey: false,
    repeat: false,
    isComposing: false,
  });
  const mapped = describeTerminalShortcutAction({ type: 'send-input', input: '\x1b[13;2u' });
  const trace = formatTerminalInputTrace({
    sequence: 1,
    time: new Date(2026, 0, 2, 3, 4, 5, 6).getTime(),
    stage: '写入终端',
    detail: mapped,
    data: '\x1b[13;2u',
  });

  assert.match(keyboardEvent, /Shift\+Enter/);
  assert.equal(mapped, '规则转换并直接写入');
  assert.match(trace, /data="\\u001b\[13;2u" \(7 字符\)/);
});

test('input trace identifies xterm pass-through handling', () => {
  assert.equal(describeTerminalShortcutAction({ type: 'pass-through' }), '交给 xterm 编码');
});
