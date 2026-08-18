import test from 'node:test';
import assert from 'node:assert/strict';
import { TerminalCommandTracker } from './terminal-command-tracker.js';

test('counts a submitted non-empty command as terminal content', () => {
  const tracker = new TerminalCommandTracker();

  assert.equal(tracker.recordWrittenInput('ls'), false);
  assert.equal(tracker.recordWrittenInput('\r'), true);
});

test('does not count an empty submission, prompt navigation, or erased input', () => {
  const tracker = new TerminalCommandTracker();

  assert.equal(tracker.recordWrittenInput('\r'), false);
  assert.equal(tracker.recordWrittenInput('\x1b[D'), false);
  assert.equal(tracker.recordWrittenInput('ls\x7f\x7f\r'), false);
});

test('reset removes an unsubmitted command from the next submission', () => {
  const tracker = new TerminalCommandTracker();

  tracker.recordWrittenInput('git status');
  tracker.reset();
  assert.equal(tracker.recordWrittenInput('\r'), false);
});
