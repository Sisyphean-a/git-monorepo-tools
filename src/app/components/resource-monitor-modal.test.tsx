import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { BackendProvider } from '../application/backend-context.js';
import type { AppBackend } from '../application/ports.js';
import { ResourceMonitorModal, Trend } from './resource-monitor-modal.js';
import { RepoHeader, summarizeFiles } from './workspace-parts.js';
import { INSPECTOR_DIALOG_STYLE } from './common.js';
import type { Repo } from '../domain/types.js';

test('monitoring entry comes before folder and uses the existing header controls', () => {
  const repo: Repo = { id: 'r', name: 'repo', path: 'E:/repo', branch: 'main', remote: 'origin', category: 'test', modified: 0, ahead: 0, behind: 0, conflicts: 0, status: 'clean', lastScan: 'now' };
  const html = renderToStaticMarkup(<RepoHeader repo={repo} fileSummary={summarizeFiles([])} onOpenMonitor={() => {}} onOpenFolder={() => {}} onOpenTerminal={() => {}} onOpenDiffViewer={() => {}} onOpenSettings={() => {}} />);
  assert.ok(html.indexOf('资源监控') < html.indexOf('文件夹'));
  assert.match(html, /查看差异/);
});

test('dialog shares diff dimensions, identifies system scope, and never invents first-sample values', () => {
  let reads = 0;
  const backend = { fetchResourceSnapshot: async () => { reads++; throw Error('unused'); } } as unknown as AppBackend;
  const html = renderToStaticMarkup(<BackendProvider backend={backend}><ResourceMonitorModal onClose={() => {}} /></BackendProvider>);
  assert.equal(INSPECTOR_DIALOG_STYLE.width, '94vw');
  assert.equal(INSPECTOR_DIALOG_STYLE.height, '92vh');
  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-label="资源监控"/);
  assert.match(html, /全系统指标/);
  assert.match(html, /系统内核池不归属于某个应用/);
  assert.match(html, /尚未采样/);
  assert.match(html, /关闭资源监控/);
  assert.equal(reads, 0);
});

test('trend renders observed samples and distinguishes its two lines without color alone', () => {
  const samples = [{ capturedAt: 1000, elapsedMillis: 1000, privateBytes: 100, heapBytes: 50, pagedBytes: 0, nonpagedBytes: 0 }, { capturedAt: 6000, elapsedMillis: 6000, privateBytes: 200, heapBytes: 80, pagedBytes: 0, nonpagedBytes: 0 }];
  const html = renderToStaticMarkup(<Trend title="主进程内存" samples={samples} first={s => s.privateBytes} second={s => s.heapBytes} firstLabel="私有提交" secondLabel="Go 堆" />);
  assert.match(html, /私有提交/);
  assert.match(html, /Go 堆/);
  assert.match(html, /stroke-dasharray="5 4"/);
  assert.doesNotMatch(html, /暂无采样/);
});
