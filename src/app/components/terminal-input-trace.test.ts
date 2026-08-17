import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendTraceEntry,
  clipTraceData,
  describeTerminalKeyboardEvent,
  describeTerminalInputError,
  describeTerminalShortcutAction,
  formatTerminalInputTrace,
  MAX_TRACE_DATA_CHARS,
  MAX_TRACE_ENTRIES,
  type TerminalInputTraceEntry,
} from './terminal-input-trace.js';

test('input trace preserves the Shift+Enter event and its stable Pi newline input', () => {
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
  const mapped = describeTerminalShortcutAction({ type: 'send-input', input: '\n' });
  const trace = formatTerminalInputTrace({
    sequence: 1,
    time: new Date(2026, 0, 2, 3, 4, 5, 6).getTime(),
    stage: '写入终端',
    detail: mapped,
    data: '\n',
  });

  assert.match(keyboardEvent, /Shift\+Enter/);
  assert.equal(mapped, '规则转换并直接写入');
  assert.match(trace, /data="\\n" \(1 字符\)/);
});

test('input trace identifies xterm pass-through handling', () => {
  assert.equal(describeTerminalShortcutAction({ type: 'pass-through' }), '交给 xterm 编码');
});

test('input trace preserves Wails string and object errors', () => {
  assert.equal(describeTerminalInputError('clipboard unavailable'), 'clipboard unavailable');
  assert.equal(describeTerminalInputError({ message: 'clipboard locked' }), 'clipboard locked');
  assert.equal(describeTerminalInputError({ code: 5 }), '{"code":5}');
});

test('trace buffer drops the oldest entries once the cap is exceeded', () => {
  let entries: readonly TerminalInputTraceEntry[] = [];
  for (let index = 0; index < MAX_TRACE_ENTRIES + 5; index += 1) {
    entries = appendTraceEntry(entries, {
      sequence: index + 1,
      time: index,
      stage: 'xterm 键盘事件',
      detail: `事件 ${index + 1}`,
    });
  }
  assert.equal(entries.length, MAX_TRACE_ENTRIES);
  assert.equal(entries[0]?.sequence, 6);
  assert.equal(entries[entries.length - 1]?.sequence, MAX_TRACE_ENTRIES + 5);
});

test('trace entry data is clipped to a bounded length', () => {
  const long = 'x'.repeat(MAX_TRACE_DATA_CHARS + 100);
  const clipped = clipTraceData(long);
  assert.equal(clipped?.length, MAX_TRACE_DATA_CHARS + 1);
  assert.ok(clipped?.endsWith('…'));
  assert.equal(clipTraceData('short'), 'short');
  assert.equal(clipTraceData(undefined), undefined);
});
