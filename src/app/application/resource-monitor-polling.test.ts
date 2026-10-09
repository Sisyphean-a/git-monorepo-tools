import test from 'node:test';
import assert from 'node:assert/strict';
import { createResourceMonitorPolling } from './resource-monitor-polling.js';
import type { ResourceSnapshot } from '../domain/resource-monitor.js';

const sample = { capturedAt: 1 } as ResourceSnapshot;
const flush = () => new Promise<void>(resolve => setImmediate(resolve));

test('polls only while active, cancels timers, and recovers from visible errors', async () => {
  let reads = 0, scheduled: (() => void) | null = null;
  const errors: unknown[] = [], results: ResourceSnapshot[] = [];
  const session = createResourceMonitorPolling({
    fetch: async () => { reads++; if (reads === 1) throw '读取被拒绝'; return sample; },
    onError: error => errors.push(error), onSnapshot: data => results.push(data), onPending: () => {},
    schedule: callback => { scheduled = callback; return 1 as unknown as ReturnType<typeof setTimeout>; },
    cancel: () => { scheduled = null; },
  });
  await session.refresh();
  assert.equal(reads, 0);
  session.setActive(true); await flush();
  assert.deepEqual(errors, ['读取被拒绝']);
  assert.ok(scheduled);
  await session.refresh();
  assert.equal(results.length, 1);
  session.setActive(false);
  assert.equal(scheduled, null);
  session.dispose();
  await session.refresh();
  assert.equal(reads, 2);
});

test('rapid focus changes never overlap reads or apply stale results', async () => {
  const complete: Array<(value: ResourceSnapshot) => void> = [];
  let reads = 0;
  const results: ResourceSnapshot[] = [];
  const session = createResourceMonitorPolling({
    fetch: () => { reads++; return new Promise(resolve => complete.push(resolve)); },
    onSnapshot: data => results.push(data), onError: () => {}, onPending: () => {},
  });
  session.setActive(true);
  session.setActive(false);
  session.setActive(true);
  await session.refresh();
  assert.equal(reads, 1);
  complete[0]!(sample); await flush();
  assert.equal(results.length, 0);
  assert.equal(reads, 2);
  session.dispose();
  complete[1]!(sample); await flush();
  assert.equal(results.length, 0);
});
