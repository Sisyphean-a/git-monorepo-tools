import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { ResourceProcessTree } from './resource-process-tree.js';
import type { MonitoredProcess, ResourceSnapshot } from '../domain/resource-monitor.js';

const mebibyte = 1024 ** 2;
const process = (pid: number, parentPid: number, overrides: Partial<MonitoredProcess> = {}): MonitoredProcess => ({
  pid, parentPid, createdAt: pid, name: 'node.exe', privateBytes: 10 * mebibyte, workingSetBytes: 20 * mebibyte, cpuTimeMillis: 1, cpuPercent: 1, handleCount: 3, ...overrides,
});
const base: ResourceSnapshot = {
  capturedAt: 1, elapsedMillis: 1, logicalCpus: 8, main: process(1, 0),
  children: [process(2, 1, { name: 'pwsh.exe', terminalSessionId: 't1' }), process(3, 2, { label: 'Pi', terminalSessionId: 't1' }), process(4, 3, { label: 'Codegraph', terminalSessionId: 't1' }), process(5, 1, { name: 'msedgewebview2.exe' }), process(6, 1, { name: 'git.exe' })],
  terminals: [{ sessionId: 't1', repoId: 'a', repoPath: 'E:/project-a', shell: 'pwsh', startedAt: 1, rootPid: 2, rootCreatedAt: 2 }],
  go: { heapBytes: 1, reservedBytes: 1, heapObjects: 1, goroutines: 1, gcCount: 0 },
  system: { totalBytes: 1, availableBytes: 1, pagedPoolBytes: 1, nonpagedPoolBytes: 1, filePool: null },
};

test('shows expandable project, terminal and process levels with own and subtree metrics', () => {
  const html = renderToStaticMarkup(<ResourceProcessTree snapshot={base} />);
  assert.match(html, /子进程 · 5/);
  assert.match(html, /私有提交合计 50.0 MiB/);
  assert.match(html, /project-a/);
  assert.match(html, /终端 · pwsh · PID 2/);
  assert.match(html, /Pi/);
  assert.match(html, /Codegraph/);
  assert.match(html, /应用界面 · WebView2/);
  assert.match(html, /其他 \/ 未确认归属/);
  assert.match(html, /自身私有提交/);
  assert.match(html, /子树私有提交/);
  assert.match(html, /30.0 MiB/);
  assert.match(html, /cd 不改变归属/);
  assert.ok((html.match(/<summary/g) ?? []).length >= 5);
  assert.equal((html.match(/pwsh.exe/g) ?? []).length, 1);
  assert.equal((html.match(/Codegraph/g) ?? []).length, 1);
});

test('keeps failed attribution, unknown measurements and absent parents explicit', () => {
  const html = renderToStaticMarkup(<ResourceProcessTree snapshot={{ ...base, terminals: [{ ...base.terminals![0]!, error: 'Job 查询失败' }], children: [process(3, 999, { terminalSessionId: 't1', privateBytes: null, cpuPercent: null, labelError: '进程用途读取失败' })] }} />);
  assert.match(html, /归属查询不完整：Job 查询失败/);
  assert.match(html, /父进程已退出或未在本组采集/);
  assert.match(html, /进程用途读取失败/);
  assert.match(html, /私有提交合计 —/);
  assert.doesNotMatch(html, /私有提交合计 0.0 MiB/);
  const unread = renderToStaticMarkup(<ResourceProcessTree snapshot={{ ...base, children: null, terminals: null }} />);
  assert.match(unread, /未采集/);
  assert.match(unread, /正在采集进程树/);
  const unknown = renderToStaticMarkup(<ResourceProcessTree snapshot={{ ...base, terminals: null }} />);
  assert.match(unknown, /终端归属未采集/);
});
