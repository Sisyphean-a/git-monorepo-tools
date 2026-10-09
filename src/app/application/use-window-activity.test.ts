import test from 'node:test';
import assert from 'node:assert/strict';
import { observeWindowActivity } from './use-window-activity.js';

function activityEnvironment() {
  const window = new EventTarget();
  const document = Object.assign(new EventTarget(), {
    visibilityState: 'visible' as DocumentVisibilityState,
    focused: true,
    hasFocus() { return this.focused; },
  });
  return { window, document };
}

test('window activity pauses on blur/hide, resumes on visible focus, and removes every listener', () => {
  const environment = activityEnvironment();
  const values: boolean[] = [];
  const stop = observeWindowActivity(environment, value => values.push(value));
  environment.window.dispatchEvent(new Event('blur'));
  environment.document.visibilityState = 'hidden';
  environment.window.dispatchEvent(new Event('focus'));
  environment.document.visibilityState = 'visible';
  environment.document.focused = false;
  environment.document.dispatchEvent(new Event('visibilitychange'));
  environment.document.focused = true;
  environment.window.dispatchEvent(new Event('focus'));
  assert.deepEqual(values, [true, false, false, false, true]);
  stop();
  environment.window.dispatchEvent(new Event('blur'));
  environment.window.dispatchEvent(new Event('focus'));
  environment.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(values.length, 5);
});

test('an initially hidden window never starts background work until it is focused', () => {
  const environment = activityEnvironment();
  environment.document.visibilityState = 'hidden';
  const values: boolean[] = [];
  const stop = observeWindowActivity(environment, value => values.push(value));
  assert.deepEqual(values, [false]);
  environment.document.visibilityState = 'visible';
  environment.window.dispatchEvent(new Event('focus'));
  assert.deepEqual(values, [false, true]);
  stop();
});
