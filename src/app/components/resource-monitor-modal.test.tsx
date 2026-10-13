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
  const html = renderToStaticMarkup(<RepoHeader repo={repo} fileSummary={summarizeFiles([])} onOpenMonitor={() => {}} onOpenBackgroundTasks={() => {}} onOpenFolder={() => {}} onOpenTerminal={() => {}} onOpenDiffViewer={() => {}} onOpenSettings={() => {}} />);
  const groups = [...html.matchAll(/role="group" aria-label="([^"]+)"[^>]*>([\s\S]*?)<\/div>/g)];
  assert.deepEqual(groups.map(group => group[1]), ['资源监控', '项目工具', '设置']);
  assert.deepEqual(groups.map(group => (group[2]!.match(/<button/g) ?? []).length), [1, 4, 1]);
  assert.equal((html.match(/role="separator" aria-orientation="vertical"/g) ?? []).length, 2);
  assert.ok(html.indexOf('资源监控') < html.indexOf('文件夹'));
  assert.match(groups[1]![2]!, /查看差异/);
  assert.match(groups[2]![2]!, /aria-label="设置"/);
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
    { capturedAt: 1_000, elapsedMillis: 1_000, intervalMillis: 0, privateBytes: 100 * mebibyte, heapBytes: 10 * mebibyte, cpuPercent: null, pagedPoolBytes: 1 * mebibyte, nonpagedPoolBytes: 200 * mebibyte, filePoolCount: 1_000, filePoolBytes: 1 * mebibyte },
    { capturedAt: 61_000, elapsedMillis: 61_000, intervalMillis: 60_000, privateBytes: 150 * mebibyte, heapBytes: 20 * mebibyte, cpuPercent: 4, pagedPoolBytes: 2 * mebibyte, nonpagedPoolBytes: 260 * mebibyte, filePoolCount: 1_120, filePoolBytes: 2 * mebibyte },
  ];
  const state: ResourceMonitorState = {
    revision: 2, live: true, startedAt: 1_000, sampleCount: 2, error: '', samples,
    peaks: { privateBytes: 160 * mebibyte, heapBytes: 24 * mebibyte, cpuPercent: 5, nonpagedPoolBytes: 300 * mebibyte },
    averageCpuPercent: 3.5,
    snapshot: {
      capturedAt: 61_000, elapsedMillis: 61_000, logicalCpus: 8,
      main: { pid: 4242, parentPid: 0, name: 'git-monorepo-tools.exe', createdAt: 1, workingSetBytes: 200 * mebibyte, privateBytes: 150 * mebibyte, cpuTimeMillis: 1_000, cpuPercent: 4, handleCount: 321 },
      terminals: [],
      children: [{ pid: 9, parentPid: 4242, name: 'git.exe', createdAt: 2, workingSetBytes: 50 * mebibyte, privateBytes: 20 * mebibyte, cpuTimeMillis: 10, cpuPercent: 1.5, handleCount: 12 }],
      go: { heapBytes: 20 * mebibyte, reservedBytes: 30 * mebibyte, heapObjects: 1_000, goroutines: 12, gcCount: 3 },
      system: { totalBytes: 16 * 1024 ** 3, availableBytes: 8 * 1024 ** 3, pagedPoolBytes: 2 * mebibyte, nonpagedPoolBytes: 260 * mebibyte, filePool: { count: 1_120, bytes: 2 * mebibyte, netPerSecond: -1.5 } },
    },
  };
  const html = renderToStaticMarkup(<ResourceMonitorContent state={state} error={null} />);
  assert.match(html, /运行 1 分 0 秒/);
  assert.match(html, /已采样 2 次（间隔 1 分 0 秒）/);
  assert.match(html, /面板刷新：每 5 秒/);
  assert.match(html, /会话开始/);
  assert.match(html, /平均 3.5%/);
  assert.match(html, /较启动 \+50.0 MiB/);
  assert.match(html, /峰值 160.0 MiB/);
  assert.match(html, /较启动 \+60.0 MiB/);
  assert.match(html, /峰值 300.0 MiB/);
  assert.match(html, /git\.exe/);
  assert.match(html, /1\.5%/);
  assert.doesNotMatch(html, /暂无采样/);
  assert.match(html, /File 内核对象 · 全系统池标签/);
  assert.match(html, /1,120/);
  assert.match(html, /−1.5 个\/秒/);
  assert.match(html, /会话平均 \+2.0 个\/秒/);
  assert.match(html, /不是 git.exe 单独占用/);

  // Layout: 卡片顺序固定为 主进程资源 / 系统内存 / Go 指标 / File 对象 / 内存总体 / 子进程表。
  assert.match(html, /主进程资源/);
  assert.match(html, /当前进程 \(PID 4242\)/);
  assert.match(html, /内存总体/);
  assert.equal((html.match(/role="progressbar"/g) ?? []).length, 1);
  assert.match(html, /可用物理内存/);
  assert.match(html, /物理内存总量/);
  assert.match(html, />50\.0%</);
  for (const [before, after] of [['主进程资源', '系统内存'], ['系统内存', 'Go 堆'], ['Go 堆', 'File 内核对象'], ['File 内核对象', '内存总体'], ['内存总体', '子进程 · 1']]) {
    assert.ok(html.indexOf(before!) < html.indexOf(after!), `${before} 应在 ${after} 之前`);
  }

  const failed = renderToStaticMarkup(<ResourceMonitorContent state={{ ...state, snapshot: { ...state.snapshot!, system: { ...state.snapshot!.system, filePool: null, filePoolError: 'NTSTATUS 0xC0000022' } } }} error={null} />);
  assert.match(failed, /File 池标签读取失败：NTSTATUS 0xC0000022/);
  assert.doesNotMatch(failed, /−1.5 个\/秒/);
  assert.match(failed, /150.0 MiB/);
});

test('distinguishes an unread process tree from an empty one', () => {
  const base = {
    capturedAt: 61_000, elapsedMillis: 61_000, logicalCpus: 8, terminals: [],
    main: { pid: 4242, parentPid: 0, name: 'tool.exe', createdAt: 1, workingSetBytes: 1, privateBytes: 1, cpuTimeMillis: 1, cpuPercent: 0, handleCount: 1 },
    go: { heapBytes: 1, reservedBytes: 1, heapObjects: 1, goroutines: 1, gcCount: 0 },
    system: { totalBytes: 1, availableBytes: 1, pagedPoolBytes: 1, nonpagedPoolBytes: 1, filePool: null },
  };
  const baseState: ResourceMonitorState = {
    revision: 2, live: true, startedAt: 1_000, sampleCount: 1, error: '',
    samples: [{ capturedAt: 61_000, elapsedMillis: 61_000, intervalMillis: 60_000, privateBytes: 1, heapBytes: 1, cpuPercent: 0, pagedPoolBytes: 1, nonpagedPoolBytes: 1, filePoolCount: null, filePoolBytes: null }],
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
    samples: [{ capturedAt: 1_000, elapsedMillis: 1_000, intervalMillis: 0, privateBytes: 100, heapBytes: 50, cpuPercent: null, pagedPoolBytes: 10, nonpagedPoolBytes: 20, filePoolCount: null, filePoolBytes: null }],
    peaks: { privateBytes: 100, heapBytes: 50, cpuPercent: null, nonpagedPoolBytes: 20 },
    averageCpuPercent: null, snapshot: null,
  };
  const html = renderToStaticMarkup(<ResourceMonitorContent state={state} error={null} />);
  assert.match(html, /首次采样无对比/);
  assert.match(html, /后台：每 30 秒/);
});

test('panel layout keeps one breakpoint rule for KPI rows and the Go grid', () => {
  const state: ResourceMonitorState = {
    revision: 1, live: false, startedAt: 1_000, sampleCount: 1, error: '',
    samples: [{ capturedAt: 1_000, elapsedMillis: 1_000, intervalMillis: 0, privateBytes: 100, heapBytes: 50, cpuPercent: null, pagedPoolBytes: 10, nonpagedPoolBytes: 20, filePoolCount: null, filePoolBytes: null }],
    peaks: { privateBytes: 100, heapBytes: 50, cpuPercent: null, nonpagedPoolBytes: 20 },
    averageCpuPercent: null, snapshot: null,
  };
  const html = renderToStaticMarkup(<ResourceMonitorContent state={state} error={null} />);
  assert.equal((html.match(/class="resource-monitor-kpis"/g) ?? []).length, 3);
  assert.equal((html.match(/class="resource-monitor-go"/g) ?? []).length, 1);
  assert.match(html, /\.resource-monitor-kpis\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)\}/);
  assert.match(html, /@media \(max-width:1150px\)\{\.resource-monitor-kpis,\.resource-monitor-go\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}\}/);
  assert.match(html, /@media \(min-width:1900px\)\{\.resource-monitor-go\{grid-template-columns:repeat\(6,minmax\(0,1fr\)\)\}\}/);
});

test('trend renders observed samples and distinguishes its two lines without color alone', () => {
  const samples: ResourceSample[] = [
    { capturedAt: 1_000, elapsedMillis: 1_000, intervalMillis: 0, privateBytes: 100, heapBytes: 50, cpuPercent: null, pagedPoolBytes: 0, nonpagedPoolBytes: 0, filePoolCount: null, filePoolBytes: null },
    { capturedAt: 6_000, elapsedMillis: 6_000, intervalMillis: 5_000, privateBytes: 200, heapBytes: 80, cpuPercent: 1, pagedPoolBytes: 0, nonpagedPoolBytes: 0, filePoolCount: null, filePoolBytes: null },
  ];
  const html = renderToStaticMarkup(<Trend title="系统内核池" samples={samples} series={[
    { label: '非分页池', color: '#3b82f6', select: s => s.nonpagedPoolBytes },
    { label: '分页池', color: '#8b5cf6', dashed: true, select: s => s.pagedPoolBytes },
  ]} />);
  assert.match(html, /非分页池/);
  assert.match(html, /分页池/);
  assert.match(html, /stroke-dasharray="5 4"/);
  assert.doesNotMatch(html, /暂无采样/);
});

test('trend omits the legend for a single series', () => {
  const samples: ResourceSample[] = [
    { capturedAt: 1_000, elapsedMillis: 1_000, intervalMillis: 0, privateBytes: 100, heapBytes: 50, cpuPercent: null, pagedPoolBytes: 0, nonpagedPoolBytes: 0, filePoolCount: null, filePoolBytes: null },
  ];
  const html = renderToStaticMarkup(<Trend title="主进程私有提交" samples={samples} series={[{ label: '私有提交', color: '#3b82f6', select: s => s.privateBytes }]} />);
  assert.match(html, /<circle/);
  assert.doesNotMatch(html, /stroke-dasharray="5 4"/);
  assert.equal((html.match(/border-top/g) ?? []).length, 0);
});
