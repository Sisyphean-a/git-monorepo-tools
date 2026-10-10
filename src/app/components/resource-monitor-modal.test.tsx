import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { BackendProvider } from '../application/backend-context.js';
import type { AppBackend } from '../application/ports.js';
import { ResourceMonitorContent, ResourceMonitorModal, Trend } from './resource-monitor-modal.js';
import { RepoHeader, summarizeFiles } from './workspace-parts.js';
import { INSPECTOR_DIALOG_STYLE } from './common.js';
import type { Repo } from '../domain/types.js';
import type { ResourceMonitorState, ResourceSample } from '../domain/resource-monitor.js';

function monitorBackend(): AppBackend {
  return {
    fetchResourceMonitorState: async () => { throw new Error('unused'); },
  } as unknown as AppBackend;
}

test('monitoring entry comes before folder and uses the existing header controls', () => {
  const repo: Repo = { id: 'r', name: 'repo', path: 'E:/repo', branch: 'main', remote: 'origin', category: 'test', modified: 0, ahead: 0, behind: 0, conflicts: 0, status: 'clean', lastScan: 'now' };
  const html = renderToStaticMarkup(<RepoHeader repo={repo} fileSummary={summarizeFiles([])} onOpenMonitor={() => {}} onOpenFolder={() => {}} onOpenTerminal={() => {}} onOpenDiffViewer={() => {}} onOpenSettings={() => {}} />);
  assert.ok(html.indexOf('资源监控') < html.indexOf('文件夹'));
  assert.match(html, /查看差异/);
});

test('dialog shares diff dimensions, identifies system scope, and waits for the first sample', () => {
  const html = renderToStaticMarkup(<BackendProvider backend={monitorBackend()}><ResourceMonitorModal onClose={() => {}} /></BackendProvider>);
  assert.equal(INSPECTOR_DIALOG_STYLE.width, '94vw');
  assert.equal(INSPECTOR_DIALOG_STYLE.height, '92vh');
  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-label="资源监控"/);
  assert.match(html, /全系统指标/);
  assert.match(html, /系统内核池不归属于某个应用/);
  assert.match(html, /尚未采样/);
  assert.match(html, /关闭资源监控/);
});

test('content shows launch baseline, deltas, peaks, whole-session trends and process CPU', () => {
  const mebibyte = 1024 ** 2;
  const samples: ResourceSample[] = [
    { capturedAt: 1_000, elapsedMillis: 1_000, intervalMillis: 0, privateBytes: 100 * mebibyte, heapBytes: 10 * mebibyte, cpuPercent: null, pagedPoolBytes: 1 * mebibyte, nonpagedPoolBytes: 200 * mebibyte },
    { capturedAt: 61_000, elapsedMillis: 61_000, intervalMillis: 60_000, privateBytes: 150 * mebibyte, heapBytes: 20 * mebibyte, cpuPercent: 4, pagedPoolBytes: 2 * mebibyte, nonpagedPoolBytes: 260 * mebibyte },
  ];
  const state: ResourceMonitorState = {
    revision: 2, live: true, startedAt: 1_000, sampleCount: 2, error: '', samples,
    peaks: { privateBytes: 160 * mebibyte, heapBytes: 24 * mebibyte, cpuPercent: 5, nonpagedPoolBytes: 300 * mebibyte },
    averageCpuPercent: 3.5,
    snapshot: {
      capturedAt: 61_000, elapsedMillis: 61_000, logicalCpus: 8,
      main: { pid: 4242, parentPid: 0, name: 'git-monorepo-tools.exe', createdAt: 1, workingSetBytes: 200 * mebibyte, privateBytes: 150 * mebibyte, cpuTimeMillis: 1_000, cpuPercent: 4, handleCount: 321 },
      children: [{ pid: 9, parentPid: 4242, name: 'git.exe', createdAt: 2, workingSetBytes: 50 * mebibyte, privateBytes: 20 * mebibyte, cpuTimeMillis: 10, cpuPercent: 1.5, handleCount: 12 }],
      go: { heapBytes: 20 * mebibyte, reservedBytes: 30 * mebibyte, heapObjects: 1_000, goroutines: 12, gcCount: 3 },
      system: { totalBytes: 16 * 1024 ** 3, availableBytes: 8 * 1024 ** 3, pagedPoolBytes: 2 * mebibyte, nonpagedPoolBytes: 260 * mebibyte },
    },
  };
  const html = renderToStaticMarkup(<ResourceMonitorContent state={state} error={null} />);
  assert.match(html, /已运行 1 分 0 秒/);
  assert.match(html, /已采样 2 次 · 平均间隔 1 分 0 秒/);
  assert.match(html, /面板打开：每 5 秒（含子进程明细）/);
  assert.match(html, /会话平均 3.5%/);
  assert.match(html, /较启动 \+50.0 MiB/);
  assert.match(html, /峰值 160.0 MiB/);
  assert.match(html, /较启动 \+60.0 MiB/);
  assert.match(html, /峰值 300.0 MiB/);
  assert.match(html, /git\.exe/);
  assert.match(html, /1\.5%/);
  assert.doesNotMatch(html, /暂无采样/);
});

test('distinguishes an unread process tree from an empty one', () => {
  const base = {
    capturedAt: 61_000, elapsedMillis: 61_000, logicalCpus: 8,
    main: { pid: 4242, parentPid: 0, name: 'tool.exe', createdAt: 1, workingSetBytes: 1, privateBytes: 1, cpuTimeMillis: 1, cpuPercent: 0, handleCount: 1 },
    go: { heapBytes: 1, reservedBytes: 1, heapObjects: 1, goroutines: 1, gcCount: 0 },
    system: { totalBytes: 1, availableBytes: 1, pagedPoolBytes: 1, nonpagedPoolBytes: 1 },
  };
  const baseState: ResourceMonitorState = {
    revision: 2, live: true, startedAt: 1_000, sampleCount: 1, error: '',
    samples: [{ capturedAt: 61_000, elapsedMillis: 61_000, intervalMillis: 60_000, privateBytes: 1, heapBytes: 1, cpuPercent: 0, pagedPoolBytes: 1, nonpagedPoolBytes: 1 }],
    peaks: { privateBytes: 1, heapBytes: 1, cpuPercent: 0, nonpagedPoolBytes: 1 },
    averageCpuPercent: 0,
    snapshot: { ...base, children: null },
  };
  const unread = renderToStaticMarkup(<ResourceMonitorContent state={baseState} error={null} />);
  assert.match(unread, /子进程 · 未采集/);
  assert.match(unread, /正在采集进程树/);
  assert.doesNotMatch(unread, /当前没有子进程/);
  const empty = renderToStaticMarkup(<ResourceMonitorContent state={{ ...baseState, snapshot: { ...base, children: [] } }} error={null} />);
  assert.match(empty, /子进程 · 0/);
  assert.match(empty, /当前没有子进程/);
  assert.doesNotMatch(empty, /正在采集进程树/);
});

test('content keeps unknown first-sample values distinct from measured ones', () => {
  const state: ResourceMonitorState = {
    revision: 1, live: false, startedAt: 1_000, sampleCount: 1, error: '',
    samples: [{ capturedAt: 1_000, elapsedMillis: 1_000, intervalMillis: 0, privateBytes: 100, heapBytes: 50, cpuPercent: null, pagedPoolBytes: 10, nonpagedPoolBytes: 20 }],
    peaks: { privateBytes: 100, heapBytes: 50, cpuPercent: null, nonpagedPoolBytes: 20 },
    averageCpuPercent: null, snapshot: null,
  };
  const html = renderToStaticMarkup(<ResourceMonitorContent state={state} error={null} />);
  assert.match(html, /首次采样无对比/);
  assert.match(html, /后台：每 30 秒/);
});

test('trend renders observed samples and distinguishes its two lines without color alone', () => {
  const samples: ResourceSample[] = [
    { capturedAt: 1_000, elapsedMillis: 1_000, intervalMillis: 0, privateBytes: 100, heapBytes: 50, cpuPercent: null, pagedPoolBytes: 0, nonpagedPoolBytes: 0 },
    { capturedAt: 6_000, elapsedMillis: 6_000, intervalMillis: 5_000, privateBytes: 200, heapBytes: 80, cpuPercent: 1, pagedPoolBytes: 0, nonpagedPoolBytes: 0 },
  ];
  const html = renderToStaticMarkup(<Trend title="主进程内存" samples={samples} first={s => s.privateBytes} second={s => s.heapBytes} firstLabel="私有提交" secondLabel="Go 堆" />);
  assert.match(html, /私有提交/);
  assert.match(html, /Go 堆/);
  assert.match(html, /stroke-dasharray="5 4"/);
  assert.doesNotMatch(html, /暂无采样/);
});
