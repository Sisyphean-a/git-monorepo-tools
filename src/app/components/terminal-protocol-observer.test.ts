import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TerminalProtocolObserver,
  extractTerminalProtocolCommands,
  needsPiLineFeedPasteCompatibility,
  needsPiFullscreenMouseCompatibility,
  PI_FULLSCREEN_MOUSE_DISABLE_SEQUENCE,
  PI_FULLSCREEN_MOUSE_ENABLE_SEQUENCE,
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
    piTitle: false,
    alternateScreenRequested: null,
    mouseTrackingRequested: null,
    mouseTrackingEnabled: null,
    sgrMouseRequested: null,
  });

  assert.equal(observer.observeXtermParsed({ bracketedPasteMode: true, mouseTrackingMode: 'none' }), true);
  assert.deepEqual(observer.getSnapshot(), {
    delivery: 'delivered',
    bracketedPasteRequested: true,
    bracketedPasteEnabled: true,
    keyboard: 'requested',
    piTitle: false,
    alternateScreenRequested: null,
    mouseTrackingRequested: null,
    mouseTrackingEnabled: 'none',
    sgrMouseRequested: null,
  });
  assert.match(formatTerminalProtocolSnapshot(observer.getSnapshot()), /受控粘贴：已开启（xterm 已确认）/);
});

test('uses Pi line-feed paste after its title and complete input protocol fingerprint are observed', () => {
  const observer = new TerminalProtocolObserver();

  observer.observeOutput('\x1b]0;π - git-');
  observer.observeOutput('monorepo-tools\x07\x1b[?2004h\x1b[>1u');
  observer.observeXtermParsed({ bracketedPasteMode: true, mouseTrackingMode: 'none' });
  assert.equal(needsPiLineFeedPasteCompatibility(observer.getSnapshot()), true);

  observer.observeTerminalInput('\x1b[?1u');
  assert.equal(needsPiLineFeedPasteCompatibility(observer.getSnapshot()), true);

  observer.observeOutput('Pi is rendering another frame');
  assert.equal(observer.getSnapshot().delivery, 'pending-xterm');
  assert.equal(needsPiLineFeedPasteCompatibility(observer.getSnapshot()), true);

  observer.observeOutput('\x1b]0;π - \x07\x1b]0;PowerShell\x07');
  assert.equal(needsPiLineFeedPasteCompatibility(observer.getSnapshot()), false);

  observer.observeOutput('\x1b]0;π - git-monorepo-tools\x07');
  assert.equal(needsPiLineFeedPasteCompatibility(observer.getSnapshot()), true);

  // Pi's update checker launches cmd/npm children that replace OSC 0 briefly.
  observer.observeOutput('\x1b]0;管理员: C:\\Windows\\system32\\cmd.exe \x07');
  observer.observeOutput('\x1b]0;npm view pi-mcp-adapter version\x07');
  assert.equal(needsPiLineFeedPasteCompatibility(observer.getSnapshot()), true);

  // Pi protocol shutdown, not a child title, ends the confirmed Pi session.
  observer.observeOutput('\x1b]0;PowerShell\x07\x1b[?2004l\x1b[>0u');
  assert.equal(needsPiLineFeedPasteCompatibility(observer.getSnapshot()), false);
});

test('recognizes a Pi title split beyond the former protocol-tail limit', () => {
  const observer = new TerminalProtocolObserver();
  const title = `π - ${'x'.repeat(512)}`;

  observer.observeOutput(`\x1b]0;${title}`);
  observer.observeOutput('\x07\x1b[?2004h\x1b[>1u');
  observer.observeXtermParsed({ bracketedPasteMode: true, mouseTrackingMode: 'none' });

  assert.equal(needsPiLineFeedPasteCompatibility(observer.getSnapshot()), true);
});

test('does not reapply a completed keyboard request retained in a full protocol tail', () => {
  const observer = new TerminalProtocolObserver();
  const request = '\x1b[>1u';

  observer.observeOutput(`${request}${'x'.repeat(4096 - request.length)}`);
  assert.equal(observer.getSnapshot().keyboard, 'requested');

  observer.observeTerminalInput('\x1b[?1u');
  observer.observeOutput('Pi is rendering another frame');
  assert.equal(observer.getSnapshot().keyboard, 'negotiated');
});

test('marks a keyboard negotiation complete only after xterm sends its response', () => {
  const observer = new TerminalProtocolObserver();

  observer.observeOutput('\x1b[>1u');
  observer.observeXtermParsed({ bracketedPasteMode: false, mouseTrackingMode: 'none' });
  assert.equal(observer.observeTerminalInput('plain input'), false);
  assert.equal(observer.observeTerminalInput('\x1b[?1u'), true);
  assert.equal(observer.getSnapshot().keyboard, 'negotiated');
});

test('tracks Pi fullscreen alternate-screen and mouse controls', () => {
  const observer = new TerminalProtocolObserver();

  observer.observeOutput('\x1b[?1049h\x1b[?1000h\x1b[?1002h\x1b[?1003h\x1b[?1006h');
  assert.equal(observer.getSnapshot().alternateScreenRequested, true);
  assert.equal(observer.getSnapshot().mouseTrackingRequested, 'any');
  assert.equal(observer.getSnapshot().sgrMouseRequested, true);

  observer.observeXtermParsed({ bracketedPasteMode: false, mouseTrackingMode: 'any' });
  assert.equal(observer.getSnapshot().mouseTrackingEnabled, 'any');
  assert.match(formatTerminalProtocolSnapshot(observer.getSnapshot()), /备用屏幕：Pi 已请求进入/);
  assert.match(formatTerminalProtocolSnapshot(observer.getSnapshot()), /鼠标跟踪：Pi 请求全量跟踪；xterm 实际为全量跟踪/);

  observer.observeOutput('\x1b[?1006l\x1b[?1003l\x1b[?1049l');
  observer.observeXtermParsed({ bracketedPasteMode: false, mouseTrackingMode: 'none' });
  assert.equal(observer.getSnapshot().alternateScreenRequested, false);
  assert.equal(observer.getSnapshot().mouseTrackingRequested, 'none');
  assert.equal(observer.getSnapshot().mouseTrackingEnabled, 'none');
  assert.equal(observer.getSnapshot().sgrMouseRequested, false);
});

test('recognizes the Pi fullscreen fingerprint only when ConPTY omitted mouse controls', () => {
  const observer = new TerminalProtocolObserver();

  observer.observeOutput('\x1b[>1u\x1b[?1049h\x1b[?2004h');
  observer.observeXtermParsed({ bracketedPasteMode: true, mouseTrackingMode: 'none' });
  assert.equal(needsPiFullscreenMouseCompatibility(observer.getSnapshot()), true);
  assert.equal(PI_FULLSCREEN_MOUSE_ENABLE_SEQUENCE, '\x1b[?1000h\x1b[?1002h\x1b[?1003h\x1b[?1004h\x1b[?1006h');
  assert.equal(PI_FULLSCREEN_MOUSE_DISABLE_SEQUENCE, '\x1b[?1006l\x1b[?1004l\x1b[?1003l\x1b[?1002l\x1b[?1000l');

  observer.observeOutput('\x1b[?1000h\x1b[?1002h\x1b[?1003h\x1b[?1006h');
  assert.equal(needsPiFullscreenMouseCompatibility(observer.getSnapshot()), false);
});

test('extracts combined fullscreen protocol commands for the input trace', () => {
  assert.equal(
    extractTerminalProtocolCommands('\x1b[?1049h\x1b[?1000;1002;1003;1004;1006h\x1b[?25l'),
    '\x1b[?1049h \x1b[?1000;1002;1003;1004;1006h',
  );
});

test('tracks explicit protocol shutdown and resets between terminal sessions', () => {
  const observer = new TerminalProtocolObserver();

  observer.observeOutput('\x1b[?2004h\x1b[>4u');
  observer.observeXtermParsed({ bracketedPasteMode: true, mouseTrackingMode: 'none' });
  observer.observeOutput('\x1b[?2004l\x1b[>0u');
  observer.observeXtermParsed({ bracketedPasteMode: false, mouseTrackingMode: 'none' });

  assert.deepEqual(observer.getSnapshot(), {
    delivery: 'delivered',
    bracketedPasteRequested: false,
    bracketedPasteEnabled: false,
    keyboard: 'disabled',
    piTitle: false,
    alternateScreenRequested: null,
    mouseTrackingRequested: null,
    mouseTrackingEnabled: 'none',
    sgrMouseRequested: null,
  });
  assert.equal(observer.reset(), true);
  assert.deepEqual(observer.getSnapshot(), {
    delivery: 'waiting',
    bracketedPasteRequested: null,
    bracketedPasteEnabled: null,
    keyboard: 'unknown',
    piTitle: false,
    alternateScreenRequested: null,
    mouseTrackingRequested: null,
    mouseTrackingEnabled: null,
    sgrMouseRequested: null,
  });
});
