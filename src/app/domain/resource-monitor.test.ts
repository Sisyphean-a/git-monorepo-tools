import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDelta, formatDuration, formatMemory, summarizeSeries, summarizeSession, type ResourceMonitorState, type ResourceSample } from './resource-monitor.js';

function sample(overrides: Partial<ResourceSample> = {}): ResourceSample {
  return {
    capturedAt: 1_000, elapsedMillis: 1_000, intervalMillis: 1_000, privateBytes: 100,
    heapBytes: 50, cpuPercent: null, pagedPoolBytes: 10, nonpagedPoolBytes: 20, ...overrides,
  };
}

function state(samples: ResourceSample[], overrides: Partial<ResourceMonitorState> = {}): ResourceMonitorState {
  return {
    revision: 1, live: false, startedAt: 1_000, sampleCount: samples.length, error: '',
    samples, peaks: { privateBytes: 500, heapBytes: 400, cpuPercent: 12.5, nonpagedPoolBytes: 900 },
    averageCpuPercent: 8, snapshot: null, ...overrides,
  };
}

test('series summaries use known endpoints and monotonic elapsed time', () => {
  const samples = [sample(), sample({ elapsedMillis: 6_000, privateBytes: null }), sample({ elapsedMillis: 11_000, privateBytes: 200 })];
  assert.deepEqual(summarizeSeries(samples, value => value.privateBytes), { start: 100, current: 200, delta: 100, perMinute: 600 });
  assert.equal(summarizeSeries([sample()], value => value.privateBytes).perMinute, null);
  assert.equal(summarizeSeries([], value => value.privateBytes).delta, null);
});

test('session summary keeps the launch baseline, average cadence and exact peaks', () => {
  const samples = [sample(), sample({ elapsedMillis: 61_000, intervalMillis: 60_000, privateBytes: 300 })];
  const summary = summarizeSession(state(samples, { sampleCount: 3, averageCpuPercent: 7.5 }));
  assert.ok(summary);
  assert.equal(summary.elapsedMillis, 60_000);
  assert.equal(summary.averageIntervalMillis, 30_000);
  assert.equal(summary.private.delta, 200);
  assert.equal(summary.heap.delta, 0);
  assert.equal(summary.averageCpuPercent, 7.5);
  assert.equal(summary.peakPrivateBytes, 500);
  assert.equal(summary.peakHeapBytes, 400);
  assert.equal(summary.peakCpuPercent, 12.5);
  assert.equal(summary.peakNonpagedPoolBytes, 900);
  assert.equal(summarizeSession(state([])), null);
});

test('formats memory, deltas and session durations for display', () => {
  assert.equal(formatMemory(null), '—');
  assert.equal(formatMemory(1024 ** 3), '1.0 GiB');
  assert.equal(formatMemory(512 * 1024 ** 2), '512.0 MiB');
  assert.equal(formatDelta(1024 ** 2), '+1.0 MiB');
  assert.equal(formatDelta(-(1024 ** 2)), '−1.0 MiB');
  assert.equal(formatDelta(null), '—');
  assert.equal(formatDuration(59_400), '59 秒');
  assert.equal(formatDuration(90_000), '1 分 30 秒');
  assert.equal(formatDuration(3_600_000), '1 时 0 分');
});
