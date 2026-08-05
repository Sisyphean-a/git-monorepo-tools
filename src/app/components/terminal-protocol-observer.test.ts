import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TerminalProtocolObserver,
  formatTerminalProtocolSnapshot,
} from './terminal-protocol-observer.js';

test('observes split Pi startup controls without changing their delivery', () => {
  const observer = new TerminalProtocolObserver();

  assert.equal(observer.observeOutput('\x1b[?20'), true);
  assert.equal(observer.observeOutput('04h\x1b[>1;2u'), true);
  assert.deepEqual(observer.getSnapshot(), {
    delivery: 'pending-xterm',
    bracketedPasteRequested: true,
    bracketedPasteEnabled: null,
    keyboard: 'requested',
  });

  assert.equal(observer.observeXtermParsed({ bracketedPasteMode: true }), true);
  assert.deepEqual(observer.getSnapshot(), {
    delivery: 'delivered',
    bracketedPasteRequested: true,
    bracketedPasteEnabled: true,
    keyboard: 'requested',
  });
  assert.match(formatTerminalProtocolSnapshot(observer.getSnapshot()), /受控粘贴：已开启（xterm 已确认）/);
});

test('marks a keyboard negotiation complete only after xterm sends its response', () => {
  const observer = new TerminalProtocolObserver();

  observer.observeOutput('\x1b[>1u');
  observer.observeXtermParsed({ bracketedPasteMode: false });
  assert.equal(observer.observeTerminalInput('plain input'), false);
  assert.equal(observer.observeTerminalInput('\x1b[?1u'), true);
  assert.equal(observer.getSnapshot().keyboard, 'negotiated');
});

test('tracks explicit protocol shutdown and resets between terminal sessions', () => {
  const observer = new TerminalProtocolObserver();

  observer.observeOutput('\x1b[?2004h\x1b[>4u');
  observer.observeXtermParsed({ bracketedPasteMode: true });
  observer.observeOutput('\x1b[?2004l\x1b[>0u');
  observer.observeXtermParsed({ bracketedPasteMode: false });

  assert.deepEqual(observer.getSnapshot(), {
    delivery: 'delivered',
    bracketedPasteRequested: false,
    bracketedPasteEnabled: false,
    keyboard: 'disabled',
  });
  assert.equal(observer.reset(), true);
  assert.deepEqual(observer.getSnapshot(), {
    delivery: 'waiting',
    bracketedPasteRequested: null,
    bracketedPasteEnabled: null,
    keyboard: 'unknown',
  });
});
