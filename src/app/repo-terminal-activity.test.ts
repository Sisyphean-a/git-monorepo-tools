import test from 'node:test';
import assert from 'node:assert/strict';
import { recordTerminalOutput, shouldSettleTerminalActivity } from './repo-terminal-activity.js';

test('terminal activity publishes only the first output and renews the active window', () => {
  const running = { sessionId: 'term-1', state: 'running', lastOutputAt: null };
  const first = recordTerminalOutput(running, 'term-1', 1000);
  const repeated = recordTerminalOutput(first.entry, 'term-1', 2000);

  assert.equal(first.shouldPublish, true);
  assert.equal(repeated.shouldPublish, false);
  assert.equal(repeated.entry.lastOutputAt, 2000);
  assert.equal(shouldSettleTerminalActivity(repeated.entry, 3399, 1400), false);
  assert.equal(shouldSettleTerminalActivity(repeated.entry, 3400, 1400), true);
});
