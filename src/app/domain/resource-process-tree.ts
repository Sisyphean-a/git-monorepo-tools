import type { MonitoredProcess, ResourceSnapshot, TerminalScope } from './resource-monitor';

export interface ProcessTotals {
  count: number;
  privateBytes: number | null;
  cpuPercent: number | null;
}

export interface ProcessNode {
  process: MonitoredProcess;
  children: ProcessNode[];
  totals: ProcessTotals;
  parentMissing: boolean;
  relationshipError?: string;
}

export interface TerminalProcessGroup {
  scope: TerminalScope;
  roots: ProcessNode[];
  totals: ProcessTotals;
}

export interface ResourceProcessGroup {
  key: string;
  kind: 'project' | 'interface' | 'unassigned';
  title: string;
  path?: string;
  terminals: TerminalProcessGroup[];
  roots: ProcessNode[];
  totals: ProcessTotals;
}

export function sumProcessTotals(values: ProcessTotals[], incomplete = false): ProcessTotals {
  return {
    count: values.reduce((sum, value) => sum + value.count, 0),
    privateBytes: incomplete || values.some(value => value.privateBytes === null) ? null : values.reduce((sum, value) => sum + value.privateBytes!, 0),
    cpuPercent: incomplete || values.some(value => value.cpuPercent === null) ? null : values.reduce((sum, value) => sum + value.cpuPercent!, 0),
  };
}

function processForest(rows: MonitoredProcess[], mainPid: number): ProcessNode[] {
  const nodes = new Map(rows.map(process => [process.pid, { process, children: [], totals: { count: 1, privateBytes: process.privateBytes, cpuPercent: process.cpuPercent }, parentMissing: false } as ProcessNode]));
  const parents = new Map<number, number>();
  for (const node of nodes.values()) {
    const parent = nodes.get(node.process.parentPid);
    if (parent && parent !== node && parent.process.createdAt > 0 && node.process.createdAt >= parent.process.createdAt) parents.set(node.process.pid, parent.process.pid);
    else node.parentMissing = node.process.parentPid !== mainPid;
  }
  // Rule: 父子关系只在同一归属组内建立；缺失、PID 复用或成环时保留独立行，不能丢失进程或重复计算。
  const finished = new Set<number>();
  for (const pid of nodes.keys()) {
    const trail: number[] = [], positions = new Map<number, number>();
    let cursor: number | undefined = pid;
    while (cursor !== undefined && !finished.has(cursor)) {
      const cycle = positions.get(cursor);
      if (cycle !== undefined) {
        for (const member of trail.slice(cycle)) {
          parents.delete(member);
          nodes.get(member)!.relationshipError = '父子关系成环，已分开展示';
        }
        break;
      }
      positions.set(cursor, trail.length);
      trail.push(cursor);
      cursor = parents.get(cursor);
    }
    trail.forEach(member => finished.add(member));
  }
  const roots: ProcessNode[] = [];
  for (const node of nodes.values()) {
    const parent = parents.get(node.process.pid);
    if (parent !== undefined) nodes.get(parent)!.children.push(node);
    else roots.push(node);
  }
  const stack = roots.map(node => ({ node, visited: false }));
  while (stack.length) {
    const { node, visited } = stack.pop()!;
    if (!visited) {
      stack.push({ node, visited: true });
      node.children.forEach(child => stack.push({ node: child, visited: false }));
    } else {
      node.children.sort((a, b) => a.process.pid - b.process.pid);
      node.totals = sumProcessTotals([{ count: 1, privateBytes: node.process.privateBytes, cpuPercent: node.process.cpuPercent }, ...node.children.map(child => child.totals)]);
    }
  }
  return roots.sort((a, b) => a.process.pid - b.process.pid);
}

export function buildProcessGroups(snapshot: ResourceSnapshot | null): ResourceProcessGroup[] | null {
  if (!snapshot || snapshot.children === null) return null;
  const rows = snapshot.children;
  const projects = new Map<string, ResourceProcessGroup>();
  const terminals = new Map<string, { group: TerminalProcessGroup; rows: MonitoredProcess[] }>();
  for (const scope of snapshot.terminals ?? []) {
    const path = scope.repoPath.replace(/\\/g, '/').replace(/\/$/, '');
    const key = scope.repoId || path.toLowerCase();
    let project = projects.get(key);
    if (!project) {
      project = { key: `project:${key}`, kind: 'project', title: path.split('/').at(-1) || scope.repoId || '未知项目', path: scope.repoPath, terminals: [], roots: [], totals: { count: 0, privateBytes: 0, cpuPercent: 0 } };
      projects.set(key, project);
    }
    const terminal: TerminalProcessGroup = { scope, roots: [], totals: { count: 0, privateBytes: 0, cpuPercent: 0 } };
    project.terminals.push(terminal);
    terminals.set(scope.sessionId, { group: terminal, rows: [] });
  }
  const remaining = new Map<number, MonitoredProcess>();
  for (const row of rows) {
    const terminal = row.terminalSessionId ? terminals.get(row.terminalSessionId) : undefined;
    if (terminal) terminal.rows.push(row);
    else remaining.set(row.pid, row);
  }
  const interfaceRows: MonitoredProcess[] = [], unassignedRows: MonitoredProcess[] = [];
  const interfaceMembership = new Map<number, boolean>();
  for (const row of remaining.values()) {
    const trail: number[] = [], visited = new Set<number>();
    let cursor: MonitoredProcess | undefined = row, belongs = false;
    while (cursor && !visited.has(cursor.pid)) {
      const known = interfaceMembership.get(cursor.pid);
      if (known !== undefined) { belongs = known; break; }
      visited.add(cursor.pid);
      trail.push(cursor.pid);
      if (cursor.parentPid === snapshot.main.pid) {
        belongs = cursor.name.toLowerCase() === 'msedgewebview2.exe';
        break;
      }
      const parent = remaining.get(cursor.parentPid);
      if (!parent || parent.createdAt <= 0 || cursor.createdAt < parent.createdAt) break;
      cursor = parent;
    }
    trail.forEach(pid => interfaceMembership.set(pid, belongs));
    (belongs ? interfaceRows : unassignedRows).push(row);
  }
  for (const { group, rows } of terminals.values()) {
    group.roots = processForest(rows, snapshot.main.pid);
    group.totals = sumProcessTotals(group.roots.map(root => root.totals), !!group.scope.error);
  }
  const groups = [...projects.values()];
  for (const project of groups) project.totals = sumProcessTotals(project.terminals.map(terminal => terminal.totals));
  for (const [kind, title, groupRows] of [
    ['interface', '应用界面 · WebView2', interfaceRows],
    ['unassigned', '其他 / 未确认归属', unassignedRows],
  ] as const) {
    if (!groupRows.length) continue;
    const roots = processForest(groupRows, snapshot.main.pid);
    groups.push({ key: kind, kind, title, terminals: [], roots, totals: sumProcessTotals(roots.map(root => root.totals)) });
  }
  return groups;
}
