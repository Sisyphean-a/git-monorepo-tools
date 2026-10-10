import type { CSSProperties, ReactNode } from 'react';
import { FolderOpen } from 'lucide-react';
import { formatMemory, type ResourceSnapshot } from '../domain/resource-monitor';
import { buildProcessGroups, sumProcessTotals, type ProcessNode, type ProcessTotals } from '../domain/resource-process-tree';
import { C } from '../theme';

const rowStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'minmax(260px, 1fr) 72px 120px 120px 130px 80px 70px 16px', alignItems: 'center', gap: 12, padding: '10px 14px', borderBottom: `1px solid ${C.border}`, fontSize: 11, minWidth: 976 };
const numberStyle: CSSProperties = { textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', color: C.textSecondary, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' };
const detailStyle: CSSProperties = { color: C.textSecondary, fontSize: 10, marginTop: 4, overflowWrap: 'anywhere' };

function Row({ name, hint, totals, node, expandable = false, depth = 0, folder = false, trailing }: { name: ReactNode; hint?: ReactNode; totals: ProcessTotals; node?: ProcessNode; expandable?: boolean; depth?: number; folder?: boolean; trailing?: ReactNode }) {
  const process = node?.process;
  const cpu = process ? process.cpuPercent : totals.cpuPercent;
  return <div style={rowStyle}>
    <div style={{ minWidth: 0, paddingLeft: depth * 18 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', color: C.textPrimary }}>
        <span className={expandable ? 'process-arrow' : undefined} aria-hidden="true" style={{ display: 'inline-block', width: 10, flexShrink: 0, color: C.textSecondary }}>{expandable ? '▸' : '·'}</span>
        {folder && <FolderOpen size={12} color={C.textSecondary} aria-hidden="true" />}
        <span>{name}</span>
        <span style={{ fontSize: 10, color: C.textSecondary, whiteSpace: 'nowrap' }}>{totals.count} 个进程</span>
      </div>
      {hint && <div style={{ ...detailStyle, paddingLeft: 16 }}>{hint}</div>}
    </div>
    <span style={numberStyle}>{node ? process?.pid ?? '—' : ''}</span>
    <span style={numberStyle}>{formatMemory(process?.privateBytes ?? null)}</span>
    <span style={numberStyle}>{formatMemory(totals.privateBytes)}</span>
    <span style={numberStyle}>{formatMemory(process?.workingSetBytes ?? null)}</span>
    <span style={numberStyle}>{cpu === null ? '—' : `${cpu.toFixed(1)}%`}</span>
    <span style={numberStyle}>{process?.handleCount?.toLocaleString() ?? '—'}</span>
    <span aria-hidden="true" style={{ color: C.textWeak, textAlign: 'right' }}>{trailing}</span>
  </div>;
}

function ProcessBranch({ node, depth = 0 }: { node: ProcessNode; depth?: number }) {
  const process = node.process;
  const hint = <>
    {node.parentMissing && <span>父进程已退出或未在本组采集 · </span>}
    {[process.error, process.labelError, process.attributionError, node.relationshipError].filter(Boolean).map((error, index) => <span key={index} style={{ color: C.conflict }}>{error} </span>)}
  </>;
  const name = <>{process.name}{process.label && <span style={{ color: C.textSecondary }}> · {process.label}</span>}</>;
  const hasHint = node.parentMissing || process.error || process.labelError || process.attributionError || node.relationshipError;
  const row = <Row name={name} hint={hasHint ? hint : undefined} totals={node.totals} node={node} expandable={node.children.length > 0} depth={depth} />;
  if (!node.children.length) return row;
  return <details>
    <summary>{row}</summary>
    {node.children.map(child => <ProcessBranch key={`${child.process.pid}:${child.process.createdAt}`} node={child} depth={depth + 1} />)}
  </details>;
}

export function ResourceProcessTree({ snapshot }: { snapshot: ResourceSnapshot | null }) {
  const groups = buildProcessGroups(snapshot);
  const totals = groups ? sumProcessTotals(groups.map(group => group.totals)) : null;
  return <section className="resource-process-tree" style={{ background: C.panel1, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
    <style>{`.resource-process-tree summary{list-style:none;cursor:pointer}.resource-process-tree summary::-webkit-details-marker{display:none}.resource-process-tree details[open]>summary .process-arrow{transform:rotate(90deg)}.resource-process-tree summary:focus-visible{outline:2px solid ${C.btnPrimary};outline-offset:-2px}`}</style>
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '4px 12px', padding: '14px 16px', borderBottom: `1px solid ${C.border}` }}>
      <h2 style={{ margin: 0, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>子进程 · {totals?.count ?? '未采集'}</h2>
      <span style={{ ...detailStyle, marginTop: 0, flex: '1 1 320px', minWidth: 0 }}>按项目 → 终端 → 当前进程展开；项目指终端的创建归属，cd 不改变归属。合计不含主进程，不是 git.exe 单独占用；私有提交不等于物理驻留内存。</span>
      <span style={{ color: C.textSecondary, fontSize: 11, whiteSpace: 'nowrap', marginLeft: 'auto' }}>面板打开时采集 · 私有提交合计 {formatMemory(totals?.privateBytes ?? null)}</span>
    </div>
    {snapshot?.children !== null && snapshot?.terminals === null && <div style={{ padding: '0 16px 10px', ...detailStyle }}>终端归属未采集，无法确认的进程单独展示。</div>}
    <div style={{ overflowX: 'auto' }}>
      <div style={{ ...rowStyle, background: C.panel2, color: C.textSecondary }}>
        {['项目 / 终端 / 进程', 'PID', '自身私有提交', '子树私有提交', '工作集（自身含共享）', 'CPU', '句柄', ''].map((title, index) => <span key={title} style={{ textAlign: index === 0 ? 'left' : 'right' }} title={title === 'CPU' ? '进程行显示自身 CPU；分组行显示已采集进程合计；未知值不计为零' : title || undefined}>{title}</span>)}
      </div>
      {groups?.map(group => <details key={group.key}>
        <summary style={{ background: C.panel2 }}><Row name={group.title} hint={group.path} totals={group.totals} expandable folder trailing={<span className="process-arrow" style={{ display: 'inline-block' }}>›</span>} /></summary>
        {group.terminals.map(terminal => <details key={terminal.scope.sessionId}>
          <summary><Row name={`终端 · ${terminal.scope.shell} · PID ${terminal.scope.rootPid || '—'}`} hint={<>{terminal.scope.sessionId}{terminal.scope.error && <span style={{ color: C.conflict }}> · 归属查询不完整：{terminal.scope.error}</span>}</>} totals={terminal.totals} expandable depth={1} /></summary>
          {terminal.roots.map(root => <ProcessBranch key={`${root.process.pid}:${root.process.createdAt}`} node={root} depth={2} />)}
          {!terminal.roots.length && <div style={{ padding: '10px 50px', ...detailStyle }}>{terminal.scope.error ? '进程数据未知，将在下次采样重试' : '本次未采集到存活进程'}</div>}
        </details>)}
        {group.roots.map(root => <ProcessBranch key={`${root.process.pid}:${root.process.createdAt}`} node={root} depth={1} />)}
      </details>)}
      {!snapshot && <div style={{ padding: 24, textAlign: 'center', ...detailStyle }}>尚无进程数据</div>}
      {snapshot && groups === null && <div style={{ padding: 24, textAlign: 'center', ...detailStyle }}>正在采集进程树…</div>}
      {groups?.length === 0 && <div style={{ padding: 24, textAlign: 'center', ...detailStyle }}>当前没有子进程</div>}
    </div>
  </section>;
}
