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

test('protects an unsubmitted draft and releases an erased draft', () => {
  const tracker = new TerminalCommandTracker();
  tracker.recordWrittenInput('ls');
  assert.equal(tracker.hasContent, true);
  tracker.recordWrittenInput('\x7f\x7f');
  assert.equal(tracker.hasContent, false);
  tracker.recordWrittenInput('git status\r');
  assert.equal(tracker.hasContent, true);
  tracker.reset();
  assert.equal(tracker.hasContent, false);
});

test('protects pending clipboard input until every queued request completes', () => {
  const tracker = new TerminalCommandTracker();
  const finishFirst = tracker.retainPendingInput();
  const finishSecond = tracker.retainPendingInput();
  assert.equal(tracker.hasContent, true);
  finishFirst();
  assert.equal(tracker.hasContent, true);
  tracker.reset();
  assert.equal(tracker.hasContent, true);
  finishSecond();
  assert.equal(tracker.hasContent, false);
});

test('protects IME composition through asynchronous xterm input delivery', () => {
  const tracker = new TerminalCommandTracker();
  tracker.beginComposition();
  assert.equal(tracker.hasContent, true);
  tracker.endComposition('中文');
  assert.equal(tracker.hasContent, true);
  tracker.recordWrittenInput('\x1b[1;1R');
  assert.equal(tracker.hasContent, true);
  tracker.recordWrittenInput('中文');
  tracker.recordWrittenInput('\x7f\x7f');
  assert.equal(tracker.hasContent, false);
  tracker.beginComposition();
  tracker.endComposition('');
  assert.equal(tracker.hasContent, false);
});

test('keeps recalled or cursor-edited input until explicit cancellation or clearing', () => {
  const tracker = new TerminalCommandTracker();
  tracker.recordWrittenInput('\x1b[A');
  assert.equal(tracker.hasContent, true);
  tracker.recordWrittenInput('\x03');
  assert.equal(tracker.hasContent, false);
  tracker.recordWrittenInput('git\x1b[D\x7f\x7f\x7f');
  assert.equal(tracker.hasContent, true);
  tracker.reset();
  assert.equal(tracker.hasContent, false);
});

test('preserves whitespace drafts and erases a supplementary character with one backspace', () => {
  const tracker = new TerminalCommandTracker();
  tracker.recordWrittenInput(' ');
  assert.equal(tracker.hasContent, true);
  tracker.reset();
  tracker.recordWrittenInput('😀\x7f');
  assert.equal(tracker.hasContent, false);
});

test('reset removes an unsubmitted command from the next submission', () => {
  const tracker = new TerminalCommandTracker();

  tracker.recordWrittenInput('git status');
  tracker.reset();
  assert.equal(tracker.recordWrittenInput('\r'), false);
});
