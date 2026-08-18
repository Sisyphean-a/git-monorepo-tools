import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TerminalProtocolStateMachine,
  extractTerminalProtocolCommands,
  formatTerminalProtocolSnapshot,
} from './terminal-protocol-observer.js';

const PI_FULLSCREEN_MOUSE_ENABLE_SEQUENCE = '\x1b[?1000h\x1b[?1002h\x1b[?1003h\x1b[?1004h\x1b[?1006h';
const PI_FULLSCREEN_MOUSE_DISABLE_SEQUENCE = '\x1b[?1006l\x1b[?1004l\x1b[?1003l\x1b[?1002l\x1b[?1000l';

test('observes split Pi startup controls without changing their delivery', () => {
  const machine = new TerminalProtocolStateMachine();

  assert.equal(machine.observeOutput('\x1b[?20').snapshotChanged, true);
  assert.equal(machine.observeOutput('04h\x1b[>1;2u').snapshotChanged, true);
  assert.deepEqual(machine.getSnapshot(), {
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

  assert.equal(machine.observeXtermParsed({ bracketedPasteMode: true, mouseTrackingMode: 'none' }).snapshotChanged, true);
  assert.deepEqual(machine.getSnapshot(), {
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
  assert.match(formatTerminalProtocolSnapshot(machine.getSnapshot()), /受控粘贴：已开启（xterm 已确认）/);
});

test('uses Pi line-feed paste after its title and complete input protocol fingerprint are observed', () => {
  const machine = new TerminalProtocolStateMachine();

  machine.observeOutput('\x1b]0;π - git-');
  machine.observeOutput('monorepo-tools\x07\x1b[?2004h\x1b[>1u');
  machine.observeXtermParsed({ bracketedPasteMode: true, mouseTrackingMode: 'none' });
  assert.equal(machine.usesPiLineFeedPaste(), true);

  machine.observeTerminalInput('\x1b[?1u');
  assert.equal(machine.usesPiLineFeedPaste(), true);

  machine.observeOutput('Pi is rendering another frame');
  assert.equal(machine.getSnapshot().delivery, 'pending-xterm');
  assert.equal(machine.usesPiLineFeedPaste(), true);

  machine.observeOutput('\x1b]0;π - \x07\x1b]0;PowerShell\x07');
  assert.equal(machine.usesPiLineFeedPaste(), false);

  machine.observeOutput('\x1b]0;π - git-monorepo-tools\x07');
  assert.equal(machine.usesPiLineFeedPaste(), true);

  // Pi's update checker launches cmd/npm children that replace OSC 0 briefly.
  machine.observeOutput('\x1b]0;管理员: C:\\Windows\\system32\\cmd.exe \x07');
  machine.observeOutput('\x1b]0;npm view pi-mcp-adapter version\x07');
  assert.equal(machine.usesPiLineFeedPaste(), true);

  // Pi protocol shutdown, not a child title, ends the confirmed Pi session.
  machine.observeOutput('\x1b]0;PowerShell\x07\x1b[?2004l\x1b[>0u');
  assert.equal(machine.usesPiLineFeedPaste(), false);
});

test('recognizes a Pi title split beyond the former protocol-tail limit', () => {
  const machine = new TerminalProtocolStateMachine();
  const title = `π - ${'x'.repeat(512)}`;

  machine.observeOutput(`\x1b]0;${title}`);
  machine.observeOutput('\x07\x1b[?2004h\x1b[>1u');
  machine.observeXtermParsed({ bracketedPasteMode: true, mouseTrackingMode: 'none' });

  assert.equal(machine.usesPiLineFeedPaste(), true);
});

test('does not reapply a completed keyboard request retained in a full protocol tail', () => {
  const machine = new TerminalProtocolStateMachine();
  const request = '\x1b[>1u';

  machine.observeOutput(`${request}${'x'.repeat(4096 - request.length)}`);
  assert.equal(machine.getSnapshot().keyboard, 'requested');

  machine.observeTerminalInput('\x1b[?1u');
  machine.observeOutput('Pi is rendering another frame');
  assert.equal(machine.getSnapshot().keyboard, 'negotiated');
});

test('marks a keyboard negotiation complete only after xterm sends its response', () => {
  const machine = new TerminalProtocolStateMachine();

  machine.observeOutput('\x1b[>1u');
  machine.observeXtermParsed({ bracketedPasteMode: false, mouseTrackingMode: 'none' });
  assert.equal(machine.observeTerminalInput('plain input').snapshotChanged, false);
  assert.equal(machine.observeTerminalInput('\x1b[?1u').snapshotChanged, true);
  assert.equal(machine.getSnapshot().keyboard, 'negotiated');
});

test('tracks Pi fullscreen alternate-screen and mouse controls', () => {
  const machine = new TerminalProtocolStateMachine();

  machine.observeOutput('\x1b[?1049h\x1b[?1000h\x1b[?1002h\x1b[?1003h\x1b[?1006h');
  assert.equal(machine.getSnapshot().alternateScreenRequested, true);
  assert.equal(machine.getSnapshot().mouseTrackingRequested, 'any');
  assert.equal(machine.getSnapshot().sgrMouseRequested, true);

  machine.observeXtermParsed({ bracketedPasteMode: false, mouseTrackingMode: 'any' });
  assert.equal(machine.getSnapshot().mouseTrackingEnabled, 'any');
  assert.match(formatTerminalProtocolSnapshot(machine.getSnapshot()), /备用屏幕：Pi 已请求进入/);
  assert.match(formatTerminalProtocolSnapshot(machine.getSnapshot()), /鼠标跟踪：Pi 请求全量跟踪；xterm 实际为全量跟踪/);

  machine.observeOutput('\x1b[?1006l\x1b[?1003l\x1b[?1049l');
  machine.observeXtermParsed({ bracketedPasteMode: false, mouseTrackingMode: 'none' });
  assert.equal(machine.getSnapshot().alternateScreenRequested, false);
  assert.equal(machine.getSnapshot().mouseTrackingRequested, 'none');
  assert.equal(machine.getSnapshot().mouseTrackingEnabled, 'none');
  assert.equal(machine.getSnapshot().sgrMouseRequested, false);
});

test('enables Pi fullscreen mouse compatibility only when ConPTY omitted mouse controls', () => {
  const machine = new TerminalProtocolStateMachine();

  machine.observeOutput('\x1b[>1u\x1b[?1049h\x1b[?2004h');
  const activation = machine.observeXtermParsed({ bracketedPasteMode: true, mouseTrackingMode: 'none' });
  assert.deepEqual(activation.effects, [{
    type: 'write-xterm',
    data: PI_FULLSCREEN_MOUSE_ENABLE_SEQUENCE,
    trace: 'Windows ConPTY 兼容：已补回 Pi 被丢弃的鼠标协议',
  }]);

  machine.reset();
  machine.observeOutput('\x1b[>1u\x1b[?1049h\x1b[?2004h\x1b[?1000h\x1b[?1002h\x1b[?1003h\x1b[?1006h');
  const nativeMouse = machine.observeXtermParsed({ bracketedPasteMode: true, mouseTrackingMode: 'any' });
  assert.deepEqual(nativeMouse.effects, []);
});

test('disables local mouse compatibility after Pi exits fullscreen', () => {
  const machine = new TerminalProtocolStateMachine();

  machine.observeOutput('\x1b[>1u\x1b[?1049h\x1b[?2004h');
  machine.observeXtermParsed({ bracketedPasteMode: true, mouseTrackingMode: 'none' });
  machine.observeOutput('\x1b[?1049l');
  const deactivation = machine.observeXtermParsed({ bracketedPasteMode: true, mouseTrackingMode: 'any' });

  assert.deepEqual(deactivation.effects, [{
    type: 'write-xterm',
    data: PI_FULLSCREEN_MOUSE_DISABLE_SEQUENCE,
    trace: 'Windows ConPTY 兼容：Pi 已退出全屏，已关闭本地鼠标协议',
  }]);
  assert.deepEqual(machine.observeXtermParsed({ bracketedPasteMode: true, mouseTrackingMode: 'none' }).effects, []);
});

test('disables local mouse compatibility when the terminal session ends', () => {
  const machine = new TerminalProtocolStateMachine();

  machine.observeOutput('\x1b[>1u\x1b[?1049h\x1b[?2004h');
  machine.observeXtermParsed({ bracketedPasteMode: true, mouseTrackingMode: 'none' });

  assert.deepEqual(machine.endSession().effects, [{
    type: 'write-xterm',
    data: PI_FULLSCREEN_MOUSE_DISABLE_SEQUENCE,
    trace: 'Windows ConPTY 兼容：终端进程已退出，已关闭本地鼠标协议',
  }]);
  assert.deepEqual(
    machine.observeXtermParsed({ bracketedPasteMode: true, mouseTrackingMode: 'none' }).effects,
    [],
  );
  assert.deepEqual(machine.endSession().effects, []);
});

test('extracts combined fullscreen protocol commands for the input trace', () => {
  assert.equal(
    extractTerminalProtocolCommands('\x1b[?1049h\x1b[?1000;1002;1003;1004;1006h\x1b[?25l'),
    '\x1b[?1049h \x1b[?1000;1002;1003;1004;1006h',
  );
});

test('tracks explicit protocol shutdown and resets between terminal sessions', () => {
  const machine = new TerminalProtocolStateMachine();

  machine.observeOutput('\x1b[?2004h\x1b[>4u');
  machine.observeXtermParsed({ bracketedPasteMode: true, mouseTrackingMode: 'none' });
  machine.observeOutput('\x1b[?2004l\x1b[>0u');
  machine.observeXtermParsed({ bracketedPasteMode: false, mouseTrackingMode: 'none' });

  assert.deepEqual(machine.getSnapshot(), {
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
  assert.equal(machine.reset().snapshotChanged, true);
  assert.deepEqual(machine.getSnapshot(), {
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

test('reset clears active compatibility without writing to an already reset xterm', () => {
  const machine = new TerminalProtocolStateMachine();

  machine.observeOutput('\x1b[>1u\x1b[?1049h\x1b[?2004h');
  machine.observeXtermParsed({ bracketedPasteMode: true, mouseTrackingMode: 'none' });
  assert.deepEqual(machine.reset().effects, []);
  assert.deepEqual(machine.endSession().effects, []);
});
