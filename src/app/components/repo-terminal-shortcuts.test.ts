import test from 'node:test';
import assert from 'node:assert/strict';
import { getWindowsTerminalShortcutAction } from './repo-terminal-shortcuts.js';

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

test('windows ctrl+v passes through to xterm default paste handling', () => {
  assert.equal(getWindowsTerminalShortcutAction({
    type: 'keydown',
    ctrlKey: true,
    altKey: false,
    metaKey: false,
    key: 'V',
  }, false, 'Win32'), 'pass-through');
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
