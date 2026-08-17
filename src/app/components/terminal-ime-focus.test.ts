import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduleTerminalImeFocusReset, type TerminalImeFocusScheduler } from './terminal-ime-focus.js';

test('terminal layout changes rebuild the IME focus context on the next frame', () => {
  const events: string[] = [];
  let nextHandle = 1;
  const callbacks = new Map<number, () => void>();
  const scheduler: TerminalImeFocusScheduler = {
    request: callback => {
      const handle = nextHandle;
      nextHandle += 1;
      callbacks.set(handle, callback);
      return handle;
    },
    cancel: handle => {
      events.push(`cancel:${handle}`);
      callbacks.delete(handle);
    },
  };
  const terminal = {
    blur: () => events.push('blur'),
    focus: () => events.push('focus'),
  };

  const first = scheduleTerminalImeFocusReset(terminal, scheduler, null);
  const second = scheduleTerminalImeFocusReset(terminal, scheduler, first);
  callbacks.get(second)?.();

  assert.deepEqual(events, ['blur', 'cancel:1', 'blur', 'focus']);
  assert.equal(callbacks.has(first), false);
});
