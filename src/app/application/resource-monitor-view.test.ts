import test from 'node:test';
import assert from 'node:assert/strict';
import { createResourceMonitorView } from './resource-monitor-view.js';
import type { ResourceMonitorState } from '../domain/resource-monitor.js';

const flush = () => new Promise<void>(resolve => setImmediate(resolve));
const idleSchedule = (_callback: () => void) => 1 as unknown as ReturnType<typeof setTimeout>;

test('clears a recovered read error even when the revision did not change', async () => {
  const results: number[] = [], errors: Array<string | null> = [];
  let reads = 0;
  const view = createResourceMonitorView({
    fetch: async () => { reads += 1; if (reads === 2) throw '读取被拒绝'; return { revision: 7 } as ResourceMonitorState; },
    onState: state => results.push(state.revision), onError: error => errors.push(error),
    schedule: idleSchedule, cancel: () => {},
  });
  await view.refresh();
  await view.refresh();
  await view.refresh();
  assert.deepEqual(errors, [null, '读取被拒绝', null]);
  assert.deepEqual(results, [7]);
  view.dispose();
});

test('ignores an older revision that resolves after a newer one', async () => {
  const resolvers: Array<(state: ResourceMonitorState) => void> = [];
  const seen: number[] = [];
  const view = createResourceMonitorView({
    fetch: () => new Promise<ResourceMonitorState>(resolve => resolvers.push(resolve)),
    onState: state => seen.push(state.revision), onError: () => {},
    schedule: idleSchedule, cancel: () => {},
  });
  void view.refresh();
  resolvers[0]?.({ revision: 9 } as ResourceMonitorState);
  await flush();
  void view.refresh();
  resolvers[1]?.({ revision: 4 } as ResourceMonitorState);
  await flush();
  assert.deepEqual(seen, [9]);
  view.dispose();
});

test('never overlaps reads, stops scheduling after dispose and drops a late response', async () => {
  const scheduled: Array<() => void> = [];
  const deferred: { resolve?: (state: ResourceMonitorState) => void } = {};
  let reads = 0;
  const seen: number[] = [];
  const view = createResourceMonitorView({
    fetch: () => { reads += 1; return new Promise<ResourceMonitorState>(resolve => { deferred.resolve = resolve; }); },
    onState: state => seen.push(state.revision), onError: () => {},
    schedule: callback => { scheduled.push(callback); return 1 as unknown as ReturnType<typeof setTimeout>; }, cancel: () => {},
  });
  void view.refresh();
  await view.refresh();
  assert.equal(reads, 1);
  view.dispose();
  deferred.resolve?.({ revision: 1 } as ResourceMonitorState);
  await flush();
  assert.deepEqual(seen, []);
  scheduled[0]?.();
  await flush();
  assert.equal(reads, 1);
});

test('keeps polling on the configured cadence after each completed read', async () => {
  const delays: number[] = [];
  const view = createResourceMonitorView({
    fetch: async () => ({ revision: 1 } as ResourceMonitorState),
    onState: () => {}, onError: () => {},
    schedule: (_callback, delay) => { delays.push(delay); return 1 as unknown as ReturnType<typeof setTimeout>; }, cancel: () => {},
    interval: 2_000,
  });
  await view.refresh();
  assert.deepEqual(delays, [2_000]);
  view.dispose();
});
