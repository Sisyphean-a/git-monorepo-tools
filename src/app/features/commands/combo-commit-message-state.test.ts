import test from 'node:test';
import assert from 'node:assert/strict';
import { createComboCommitMessageState } from './combo-commit-message-state.js';

test('keeps a generated combo message after its project is no longer active', () => {
  const visibleMessages: string[] = [];
  let isProjectActive = true;
  const message = createComboCommitMessageState('', nextMessage => {
    if (isProjectActive) visibleMessages.push(nextMessage);
  });

  isProjectActive = false;
  message.setMessage('fix: complete the workflow');

  assert.equal(message.getMessage(), 'fix: complete the workflow');
  assert.deepEqual(visibleMessages, []);
});
