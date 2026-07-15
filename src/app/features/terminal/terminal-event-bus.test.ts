import test from 'node:test';
import assert from 'node:assert/strict';
import { TerminalEventBus } from './terminal-event-bus.js';

test('terminal event bus routes output and exit events per session and disconnects when empty', () => {
  const events: Array<{ event: string; payload: any }> = [];
  const stops: string[] = [];
  const bus = new TerminalEventBus((event, handler) => {
    events.push({ event, payload: handler });
    return () => {
      stops.push(event);
    };
  });

  const firstOutputs: string[] = [];
  const firstExits: number[] = [];
  const secondOutputs: string[] = [];
  const secondExits: number[] = [];

  const first = bus.createSubscription({
    onOutput: chunk => firstOutputs.push(chunk),
    onExit: exitCode => firstExits.push(exitCode),
  });
  const second = bus.createSubscription({
    onOutput: chunk => secondOutputs.push(chunk),
    onExit: exitCode => secondExits.push(exitCode),
  });
  first.bindSession('term-a');
  second.bindSession('term-b');

  assert.equal(events.length, 2);
  const [outputHandler, exitHandler] = events.map(entry => entry.payload as (payload: any) => void);
  assert.ok(outputHandler);
  assert.ok(exitHandler);

  outputHandler({ sessionId: 'term-a', chunk: 'hello' });
  outputHandler({ sessionId: 'term-b', chunk: 'world' });
  exitHandler({ sessionId: 'term-a', exitCode: 0 });
  exitHandler({ sessionId: 'term-b', exitCode: 1 });

  assert.deepEqual(firstOutputs, ['hello']);
  assert.deepEqual(secondOutputs, ['world']);
  assert.deepEqual(firstExits, [0]);
  assert.deepEqual(secondExits, [1]);

  first.dispose();
  assert.deepEqual(stops, []);
  second.dispose();
  assert.deepEqual(stops, ['repo-terminal-output', 'repo-terminal-exit']);
});
