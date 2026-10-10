import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProcessGroups, type ProcessNode } from './resource-process-tree.js';
import type { MonitoredProcess, ResourceSnapshot, TerminalScope } from './resource-monitor.js';

const process = (pid: number, parentPid: number, overrides: Partial<MonitoredProcess> = {}): MonitoredProcess => ({
  pid, parentPid, name: 'node.exe', createdAt: pid, workingSetBytes: 20, privateBytes: 10, cpuTimeMillis: 1, cpuPercent: 1, handleCount: 2, ...overrides,
});
const scope = (sessionId: string, repoId: string, overrides: Partial<TerminalScope> = {}): TerminalScope => ({
  sessionId, repoId, repoPath: `E:/${repoId}`, shell: 'pwsh', startedAt: 1, rootPid: 2, rootCreatedAt: 2, ...overrides,
});
function snapshot(children: MonitoredProcess[] | null, terminals: TerminalScope[] | null = []): ResourceSnapshot {
  return { capturedAt: 1, elapsedMillis: 1, logicalCpus: 8, main: process(1, 0), children, terminals, go: { heapBytes: 1, reservedBytes: 1, heapObjects: 1, goroutines: 1, gcCount: 0 }, system: { totalBytes: 1, availableBytes: 1, pagedPoolBytes: 1, nonpagedPoolBytes: 1, filePool: null } };
}
const flatten = (nodes: ProcessNode[]): number[] => nodes.flatMap(node => [node.process.pid, ...flatten(node.children)]);

test('groups by project and terminal, preserves nesting and counts every process once', () => {
  const groups = buildProcessGroups(snapshot([
    process(2, 1, { terminalSessionId: 't1', name: 'pwsh.exe' }),
    process(3, 2, { terminalSessionId: 't1', label: 'Pi' }),
    process(4, 3, { terminalSessionId: 't1', label: 'Codegraph' }),
    process(5, 1, { terminalSessionId: 't2', name: 'pwsh.exe' }),
    process(6, 1, { terminalSessionId: 't3', name: 'pwsh.exe' }),
    process(7, 1, { name: 'msedgewebview2.exe' }),
    process(8, 7, { name: 'msedgewebview2.exe' }),
    process(9, 1, { name: 'git.exe' }),
  ], [scope('t1', 'project-a'), scope('t2', 'project-a', { rootPid: 5, rootCreatedAt: 5 }), scope('t3', 'project-b', { rootPid: 6, rootCreatedAt: 6 })]));
  assert.ok(groups);
  const projects = groups.filter(group => group.kind === 'project');
  assert.equal(projects.length, 2);
  assert.equal(projects[0]!.terminals.length, 2);
  assert.equal(projects[0]!.totals.count, 4);
  assert.equal(projects[0]!.totals.privateBytes, 40);
  const shell = projects[0]!.terminals[0]!.roots[0]!;
  assert.equal(shell.totals.privateBytes, 30);
  assert.equal(shell.process.privateBytes, 10);
  assert.equal(shell.children[0]!.children[0]!.process.label, 'Codegraph');
  const all = groups.flatMap(group => [...flatten(group.roots), ...group.terminals.flatMap(terminal => flatten(terminal.roots))]);
  assert.deepEqual(all.slice().sort((a, b) => a - b), [2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(new Set(all).size, all.length);
  assert.deepEqual(groups.find(group => group.kind === 'interface')!.totals, { count: 2, privateBytes: 20, cpuPercent: 2 });
});

test('keeps missing parents and stale terminal IDs visible without guessing ownership', () => {
  const groups = buildProcessGroups(snapshot([
    process(10, 999, { terminalSessionId: 't1' }),
    process(11, 1, { terminalSessionId: 'closed-session' }),
    process(12, 1, { attributionError: '归属冲突' }),
  ], [scope('t1', 'project-a')]))!;
  assert.deepEqual(flatten(groups[0]!.terminals[0]!.roots), [10]);
  assert.equal(groups[0]!.terminals[0]!.roots[0]!.parentMissing, true);
  assert.deepEqual(flatten(groups.find(group => group.kind === 'unassigned')!.roots), [11, 12]);
});

test('rejects PID-reused parent links and cyclic links while retaining all rows', () => {
  const groups = buildProcessGroups(snapshot([
    process(2, 3, { createdAt: 1 }), process(3, 2, { createdAt: 1 }),
    process(4, 5, { createdAt: 4 }), process(5, 1, { createdAt: 6 }),
  ]))!;
  const roots = groups[0]!.roots;
  assert.equal(roots.length, 4);
  assert.equal(roots[0]!.relationshipError, '父子关系成环，已分开展示');
  assert.equal(roots[2]!.parentMissing, true);
  assert.deepEqual(flatten(roots), [2, 3, 4, 5]);
});

test('unknown measurements and partial membership failure never become complete zero totals', () => {
  const groups = buildProcessGroups(snapshot([
    process(2, 1, { terminalSessionId: 't1', privateBytes: null, cpuPercent: null }),
    process(3, 2, { terminalSessionId: 't1' }),
  ], [scope('t1', 'project-a'), scope('t2', 'project-a', { error: 'Job 查询失败' })]))!;
  assert.equal(groups[0]!.totals.privateBytes, null);
  assert.equal(groups[0]!.totals.cpuPercent, null);
  assert.equal(groups[0]!.terminals[0]!.totals.privateBytes, null);
  assert.equal(groups[0]!.terminals[1]!.totals.privateBytes, null);
  assert.equal(buildProcessGroups(snapshot(null)), null);
  assert.deepEqual(buildProcessGroups(snapshot([])), []);
});
