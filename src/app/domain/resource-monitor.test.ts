import test from 'node:test';
import assert from 'node:assert/strict';
import { appendResourceSample, formatMemory, poolGrowthPerMinute, processCPUPercent, RESOURCE_HISTORY_LIMIT, type ResourceSnapshot, type ResourceSample } from './resource-monitor.js';

function snapshot(time = 1_000): ResourceSnapshot {
  return {
    capturedAt: time, elapsedMillis: time, logicalCpus: 4,
    main: { pid: 1, parentPid: 0, name: 'tool.exe', createdAt: 10, privateBytes: 100, workingSetBytes: 200, cpuTimeMillis: time / 2, handleCount: 10 },
    children: [], go: { heapBytes: 10, reservedBytes: 20, heapObjects: 1, goroutines: 2, gcCount: 0 },
    system: { totalBytes: 1_000, availableBytes: 500, pagedPoolBytes: 100, nonpagedPoolBytes: time },
  };
}

test('history keeps only numeric samples and remains bounded', () => {
  let history: ResourceSample[] = [];
  for (let index = 0; index < 90; index++) history = appendResourceSample(history, snapshot(index));
  assert.equal(history.length, RESOURCE_HISTORY_LIMIT);
  assert.equal(history[0]?.elapsedMillis, 30);
  assert.equal('children' in history[0]!, false);
});

test('CPU is measured between samples and never crosses process identity', () => {
  const first = snapshot(1_000), next = snapshot(6_000);
  assert.equal(processCPUPercent(first.main, undefined, 0, 4), null);
  assert.equal(processCPUPercent(next.main, first.main, 5_000, 4), 12.5);
  assert.equal(processCPUPercent({ ...next.main, createdAt: 99 }, first.main, 5_000, 4), null);
});

test('pool growth uses elapsed time, not wall clock or application attribution', () => {
  const first = snapshot(1_000), next = snapshot(6_000);
  next.capturedAt = 0;
  const history = appendResourceSample(appendResourceSample([], first), next);
  assert.equal(poolGrowthPerMinute(history), 60_000);
  assert.equal(poolGrowthPerMinute(history.slice(0, 1)), null);
  assert.equal(formatMemory(null), '—');
  assert.equal(formatMemory(1024 ** 3), '1.0 GiB');
});
