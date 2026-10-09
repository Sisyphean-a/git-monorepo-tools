export interface MonitoredProcess {
  pid: number;
  parentPid: number;
  name: string;
  createdAt: number;
  workingSetBytes: number | null;
  privateBytes: number | null;
  cpuTimeMillis: number | null;
  handleCount: number | null;
  error?: string;
}

export interface ResourceSnapshot {
  capturedAt: number;
  elapsedMillis: number;
  logicalCpus: number;
  main: MonitoredProcess;
  children: MonitoredProcess[];
  go: { heapBytes: number; reservedBytes: number; heapObjects: number; goroutines: number; gcCount: number };
  system: { totalBytes: number; availableBytes: number; pagedPoolBytes: number; nonpagedPoolBytes: number };
}

export interface ResourceSample {
  capturedAt: number;
  elapsedMillis: number;
  privateBytes: number | null;
  heapBytes: number;
  pagedBytes: number;
  nonpagedBytes: number;
}

export const RESOURCE_SAMPLE_INTERVAL = 5_000;
// Rule: 只保留 60 次轻量数值采样，进程明细仅保留最新一次。
export const RESOURCE_HISTORY_LIMIT = 60;

export function appendResourceSample(samples: ResourceSample[], snapshot: ResourceSnapshot): ResourceSample[] {
  return [...samples, {
    capturedAt: snapshot.capturedAt, elapsedMillis: snapshot.elapsedMillis,
    privateBytes: snapshot.main.privateBytes, heapBytes: snapshot.go.heapBytes,
    pagedBytes: snapshot.system.pagedPoolBytes, nonpagedBytes: snapshot.system.nonpagedPoolBytes,
  }].slice(-RESOURCE_HISTORY_LIMIT);
}

export function processCPUPercent(process: MonitoredProcess, previous: MonitoredProcess | undefined, elapsed: number, cores: number): number | null {
  if (!previous || process.createdAt !== previous.createdAt || process.pid !== previous.pid
    || process.cpuTimeMillis === null || previous.cpuTimeMillis === null || elapsed <= 0 || cores <= 0) return null;
  const delta = process.cpuTimeMillis - previous.cpuTimeMillis;
  return delta < 0 ? null : delta / elapsed / cores * 100;
}

export function poolGrowthPerMinute(samples: ResourceSample[]): number | null {
  const first = samples[0], last = samples.at(-1);
  if (!first || !last || last.elapsedMillis <= first.elapsedMillis) return null;
  return (last.nonpagedBytes - first.nonpagedBytes) / (last.elapsedMillis - first.elapsedMillis) * 60_000;
}

export function formatMemory(bytes: number | null): string {
  if (bytes === null) return '—';
  const unit = bytes >= 1024 ** 3 ? 'GiB' : 'MiB';
  return (bytes / (unit === 'GiB' ? 1024 ** 3 : 1024 ** 2)).toFixed(1) + ' ' + unit;
}
