export interface MonitoredProcess {
  pid: number;
  parentPid: number;
  name: string;
  createdAt: number;
  workingSetBytes: number | null;
  privateBytes: number | null;
  cpuTimeMillis: number | null;
  cpuPercent: number | null;
  handleCount: number | null;
  error?: string;
  terminalSessionId?: string;
  label?: string;
  labelError?: string;
  attributionError?: string;
}

export interface FilePool {
  count: number;
  bytes: number;
  netPerSecond: number | null;
}

export interface TerminalScope {
  sessionId: string;
  repoId: string;
  repoPath: string;
  shell: string;
  startedAt: number;
  rootPid: number;
  rootCreatedAt: number;
  error?: string;
}

export interface ResourceSnapshot {
  capturedAt: number;
  elapsedMillis: number;
  logicalCpus: number;
  main: MonitoredProcess;
  // null 表示本次采样未枚举进程树（未采集），[] 表示已枚举且确实没有子进程。
  children: MonitoredProcess[] | null;
  terminals: TerminalScope[] | null;
  go: { heapBytes: number; reservedBytes: number; heapObjects: number; goroutines: number; gcCount: number };
  system: { totalBytes: number; availableBytes: number; pagedPoolBytes: number; nonpagedPoolBytes: number; filePool: FilePool | null; filePoolError?: string };
}

// Sample 是后端采样器返回的轻量历史点；intervalMillis 是它与上一点之间的单调毫秒间隔。
export interface ResourceSample {
  capturedAt: number;
  elapsedMillis: number;
  intervalMillis: number;
  privateBytes: number | null;
  heapBytes: number;
  cpuPercent: number | null;
  pagedPoolBytes: number;
  nonpagedPoolBytes: number;
  filePoolCount: number | null;
  filePoolBytes: number | null;
}

export interface ResourcePeaks {
  privateBytes: number | null;
  heapBytes: number;
  cpuPercent: number | null;
  nonpagedPoolBytes: number;
}

// State 覆盖应用从打开到关闭的采样视图：后台低频、面板打开时高频，历史由后端降采样但有界。
export interface ResourceMonitorState {
  revision: number;
  live: boolean;
  startedAt: number;
  sampleCount: number;
  error: string;
  samples: ResourceSample[];
  peaks: ResourcePeaks;
  averageCpuPercent: number | null;
  snapshot: ResourceSnapshot | null;
}

// Rule: 面板轮询只读取后端缓存并续租高频窗口，采样节奏由原生采样器拥有，轮询丢失一次更新不会跳过采样。
export const RESOURCE_MONITOR_POLL_INTERVAL = 2_000;

export function formatMemory(bytes: number | null): string {
  if (bytes === null) return '—';
  const unit = bytes >= 1024 ** 3 ? 'GiB' : 'MiB';
  return (bytes / (unit === 'GiB' ? 1024 ** 3 : 1024 ** 2)).toFixed(1) + ' ' + unit;
}

export function formatDelta(bytes: number | null): string {
  if (bytes === null) return '—';
  if (bytes < 0) return `−${formatMemory(-bytes)}`;
  return `+${formatMemory(bytes)}`;
}

export function formatCountRate(value: number | null): string {
  if (value === null) return '—';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${Math.abs(value).toFixed(1)} 个/秒`;
}

export function formatDuration(millis: number): string {
  const seconds = Math.max(0, Math.round(millis / 1000));
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分 ${seconds % 60} 秒`;
  return `${Math.floor(minutes / 60)} 时 ${minutes % 60} 分`;
}

export interface SeriesSummary {
  start: number | null;
  current: number | null;
  delta: number | null;
  perMinute: number | null;
}

// Flow: 跳过未知点，用第一个与最后一个已知值给出变化量和平均变化率，顺序只依赖采样时的单调时间。
export function summarizeSeries(samples: ResourceSample[], select: (sample: ResourceSample) => number | null): SeriesSummary {
  let start: number | null = null, current: number | null = null, startElapsed = 0, currentElapsed = 0;
  for (const sample of samples) {
    const value = select(sample);
    if (value === null) continue;
    if (start === null) { start = value; startElapsed = sample.elapsedMillis; }
    current = value; currentElapsed = sample.elapsedMillis;
  }
  const duration = currentElapsed - startElapsed;
  return {
    start, current,
    delta: start === null || current === null ? null : current - start,
    perMinute: start === null || current === null || duration <= 0 ? null : (current - start) / duration * 60_000,
  };
}

export interface SessionSummary {
  startedAt: number;
  elapsedMillis: number;
  sampleCount: number;
  averageIntervalMillis: number;
  averageCpuPercent: number | null;
  private: SeriesSummary;
  heap: SeriesSummary;
  nonpaged: SeriesSummary;
  paged: SeriesSummary;
  fileCount: SeriesSummary;
  fileBytes: SeriesSummary;
  peakPrivateBytes: number | null;
  peakHeapBytes: number;
  peakCpuPercent: number | null;
  peakNonpagedPoolBytes: number;
}

// Rule: 峰值来自后端对全部原始采样的统计，不受历史降采样影响；启动基线由历史首点保留。
export function summarizeSession(state: ResourceMonitorState): SessionSummary | null {
  const first = state.samples[0], last = state.samples.at(-1);
  if (!first || !last) return null;
  const duration = last.elapsedMillis - first.elapsedMillis;
  return {
    startedAt: state.startedAt || first.capturedAt,
    elapsedMillis: duration,
    sampleCount: state.sampleCount,
    averageIntervalMillis: state.sampleCount > 1 && duration > 0 ? duration / (state.sampleCount - 1) : 0,
    averageCpuPercent: state.averageCpuPercent,
    private: summarizeSeries(state.samples, sample => sample.privateBytes),
    heap: summarizeSeries(state.samples, sample => sample.heapBytes),
    nonpaged: summarizeSeries(state.samples, sample => sample.nonpagedPoolBytes),
    paged: summarizeSeries(state.samples, sample => sample.pagedPoolBytes),
    fileCount: summarizeSeries(state.samples, sample => sample.filePoolCount),
    fileBytes: summarizeSeries(state.samples, sample => sample.filePoolBytes),
    peakPrivateBytes: state.peaks.privateBytes,
    peakHeapBytes: state.peaks.heapBytes,
    peakCpuPercent: state.peaks.cpuPercent,
    peakNonpagedPoolBytes: state.peaks.nonpagedPoolBytes,
  };
}
