import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Activity, AlertTriangle, Boxes, Cpu, Database, Files, FileText, Gauge, HardDrive, Layers, MemoryStick, RefreshCw, Server, TrendingUp, X } from 'lucide-react';
import { useAppBackend } from '../application/backend-context';
import { createResourceMonitorView } from '../application/resource-monitor-view';
import { formatCountRate, formatDelta, formatDuration, formatMemory, summarizeSession, type ResourceMonitorState, type ResourceSample, type ResourceSnapshot, type SessionSummary } from '../domain/resource-monitor';
import { ResourceProcessTree } from './resource-process-tree';
import { C } from '../theme';
import { INSPECTOR_BACKDROP_STYLE, INSPECTOR_DIALOG_STYLE } from './common';

const mono = 'JetBrains Mono, monospace';
const cardStyle: CSSProperties = { padding: 20, background: C.panel1, border: `1px solid ${C.border}`, borderRadius: 8, minWidth: 0 };
const twoColumnStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(420px, 100%), 1fr))', gap: 14 };
const labelStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.textSecondary, minWidth: 0 };
const hintStyle: CSSProperties = { color: C.textSecondary, fontSize: 10 };
const kpiRowStyle: CSSProperties = { display: 'grid', gap: '16px 14px', margin: '18px 0' };
const goGridStyle: CSSProperties = { display: 'grid', gap: '18px 14px', alignContent: 'start', padding: '20px 4px 0', minWidth: 0 };
// Rule: 弹窗固定 94vw，列数用视口断点表达：卡片 KPI 行 3 列；Go 指标格 3 列，设计稿宽度（≥1900）下一行 6 个；窄窗退回 2 列。
const layoutStyle = `.resource-monitor-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}.resource-monitor-go{grid-template-columns:repeat(3,minmax(0,1fr))}@media (max-width:1150px){.resource-monitor-kpis,.resource-monitor-go{grid-template-columns:repeat(2,minmax(0,1fr))}}@media (min-width:1900px){.resource-monitor-go{grid-template-columns:repeat(6,minmax(0,1fr))}}`;

export function ResourceMonitorModal({ onClose }: { onClose: () => void }) {
  const backend = useAppBackend();
  const [state, setState] = useState<ResourceMonitorState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    // Flow: 面板打开期间持续读取采样器状态，读取本身续租高频窗口；关闭后租约到期自动回到后台节奏。
    const view = createResourceMonitorView({
      fetch: () => backend.fetchResourceMonitorState(),
      onState: setState,
      onError: setError,
    });
    void view.refresh();
    return () => view.dispose();
  }, [backend]);

  useEffect(() => {
    const origin = document.activeElement;
    closeButton.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onCloseRef.current(); }
      if (event.key !== 'Tab') return;
      const elements = dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex="0"]');
      if (!elements?.length) return;
      const first = elements[0], last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('keydown', handleKey);
      if (origin instanceof HTMLElement && origin.isConnected) origin.focus();
    };
  }, []);

  const snapshot = state?.snapshot ?? null;
  const failure = error ?? state?.error ?? null;
  return (
    <>
      <div onClick={onClose} style={INSPECTOR_BACKDROP_STYLE} />
      <div ref={dialog} role="dialog" aria-modal="true" aria-label="资源监控" style={INSPECTOR_DIALOG_STYLE}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          <Activity size={16} color={C.btnPrimary} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.textPrimary }}>资源监控</div>
            <div style={{ marginTop: 3, fontSize: 10, color: C.textSecondary }}>Git Monorepo Tools{snapshot ? ` · PID ${snapshot.main.pid}` : ''}</div>
          </div>
          <span role="status" style={{ color: failure ? C.conflict : C.textSecondary, fontSize: 11 }}>{failure ? '采样失败' : '应用级采样'}</span>
          <button ref={closeButton} type="button" onClick={onClose} aria-label="关闭资源监控" title="关闭" style={{ display: 'flex', padding: 4, background: 'none', border: 'none', color: C.textSecondary, cursor: 'pointer' }}><X size={17} /></button>
        </header>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          <ResourceMonitorContent state={state} error={failure} />
        </div>
      </div>
    </>
  );
}

// Layout: 会话条 → 主进程与系统内存两列 → Go 指标与 File 对象两列 → 内存总体条 → 子进程表。
export function ResourceMonitorContent({ state, error }: { state: ResourceMonitorState | null; error: string | null }) {
  const snapshot = state?.snapshot ?? null;
  const summary = state ? summarizeSession(state) : null;
  const samples = state?.samples ?? [];
  const system = snapshot?.system ?? null;
  const file = system?.filePool ?? null;
  const mainCpu = snapshot?.main.cpuPercent ?? null;
  return (
    <>
      <style>{layoutStyle}</style>
      <SessionStrip state={state} summary={summary} />
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {error && <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.conflict, background: `${C.conflict}12`, border: `1px solid ${C.conflict}40`, borderRadius: 6, padding: '10px 12px', fontSize: 12 }}><AlertTriangle size={14} />{error} · 已保留上次采样，将自动重试</div>}
        <div style={twoColumnStyle}>
          <section style={cardStyle}>
            <CardHead icon={<Cpu size={15} color={C.btnPrimary} />} title="主进程资源" subtitle={snapshot ? `当前进程 (PID ${snapshot.main.pid})` : '等待首次采样'} hint="进程指标" />
            <div className="resource-monitor-kpis" style={kpiRowStyle}>
              <Metric label="私有提交" icon={<Database size={12} color={C.btnPrimary} />} value={formatMemory(snapshot?.main.privateBytes ?? null)} size={26}
                hints={summary ? [`较启动 ${formatDelta(summary.private.delta)}`, `峰值 ${formatMemory(summary.peakPrivateBytes)}`] : ['等待采样']}
                title="此进程独占的已提交内存，不等于物理驻留内存" />
              <Metric label="工作集" icon={<MemoryStick size={12} color={C.btnPrimary} />} value={formatMemory(snapshot?.main.workingSetBytes ?? null)} size={26} title="当前驻留物理内存，包含共享页面" />
              <Metric label="CPU" icon={<Activity size={12} color={C.added} />} value={mainCpu === null ? '—' : `${mainCpu.toFixed(1)}%`} size={26}
                hints={summary?.averageCpuPercent == null ? ['首次采样无对比'] : [`平均 ${summary.averageCpuPercent.toFixed(1)}%`, ...(summary.peakCpuPercent == null ? [] : [`峰值 ${summary.peakCpuPercent.toFixed(1)}%`])]}
                title="相邻采样间的 CPU 使用率，按逻辑核数归一化；首次采样无值" />
            </div>
            <Trend title="主进程私有提交" samples={samples} series={[{ label: '私有提交', color: C.btnPrimary, select: sample => sample.privateBytes }]} />
          </section>
          <section style={cardStyle} title="系统内核池不归属于某个应用；这里只读监控，不清理内存。">
            <CardHead icon={<Server size={15} color={C.btnPrimary} />} title="系统内存" hint="全系统指标" />
            <div className="resource-monitor-kpis" style={kpiRowStyle}>
              <Metric label="非分页池" icon={<Dot color={C.btnPrimary} />} value={formatMemory(system?.nonpagedPoolBytes ?? null)} size={26}
                hints={summary ? [`较启动 ${formatDelta(summary.nonpaged.delta)}`, `峰值 ${formatMemory(summary.peakNonpagedPoolBytes)}`] : ['等待采样']} />
              <Metric label="分页池" icon={<Dot color={C.aiAccent} />} value={formatMemory(system?.pagedPoolBytes ?? null)} size={26}
                hints={summary ? [`较启动 ${formatDelta(summary.paged.delta)}`] : []} />
              <Metric label="非分页池变化" icon={<Dot color={C.modified} />} value={summary?.nonpaged.perMinute == null ? '—' : `${formatDelta(summary.nonpaged.perMinute)}/min`} size={26}
                title="本次会话已保留采样的平均变化率，不代表本工具造成的增长" />
            </div>
            <Trend title="系统内核池" samples={samples} series={[
              { label: '非分页池', color: C.btnPrimary, select: sample => sample.nonpagedPoolBytes },
              { label: '分页池', color: C.aiAccent, dashed: true, select: sample => sample.pagedPoolBytes },
            ]} />
          </section>
        </div>
        <div style={twoColumnStyle}>
          <div className="resource-monitor-go" style={goGridStyle}>
            <Metric label="Go 堆" icon={<Layers size={12} color={C.btnPrimary} />} value={formatMemory(snapshot?.go.heapBytes ?? null)} hints={summary ? [`较启动 ${formatDelta(summary.heap.delta)}`] : []} />
            <Metric label="Go 已取得内存" icon={<HardDrive size={12} color={C.btnPrimary} />} value={formatMemory(snapshot?.go.reservedBytes ?? null)} title="Go 运行时向系统取得的内存，不是进程工作集" />
            <Metric label="句柄" icon={<Files size={12} color={C.btnPrimary} />} value={snapshot?.main.handleCount?.toLocaleString() ?? '—'} />
            <Metric label="Goroutine" icon={<Activity size={12} color={C.btnPrimary} />} value={snapshot?.go.goroutines.toLocaleString() ?? '—'} />
            <Metric label="堆对象" icon={<Boxes size={12} color={C.btnPrimary} />} value={snapshot?.go.heapObjects.toLocaleString() ?? '—'} />
            <Metric label="GC 次数" icon={<RefreshCw size={12} color={C.btnPrimary} />} value={snapshot?.go.gcCount.toLocaleString() ?? '—'} />
          </div>
          <section style={cardStyle}>
            <CardHead icon={<FileText size={15} color={C.btnPrimary} />} title="File 内核对象 · 全系统池标签" />
            <div className="resource-monitor-kpis" style={kpiRowStyle}>
              <Metric label="存活数量" icon={<Database size={12} color={C.btnPrimary} />} value={file?.count.toLocaleString() ?? '—'} size={24}
                title="全系统 File 标签的累计分配减累计释放，统计存活分配块，不是文件句柄数量" />
              <Metric label="占用内存" icon={<MemoryStick size={12} color={C.btnPrimary} />} value={formatMemory(file?.bytes ?? null)} size={24}
                hints={file && summary ? [`较首次有效采样 ${formatDelta(summary.fileBytes.delta)}`] : []} title="File 标签的分页池与非分页池占用合计，不能归属到本工具" />
              <Metric label="每秒净增长" icon={<TrendingUp size={12} color={C.modified} />} value={formatCountRate(file?.netPerSecond ?? null)} size={24}
                hints={file && summary?.fileCount.perMinute != null ? [`会话平均 ${formatCountRate(summary.fileCount.perMinute / 60)}`] : []}
                title="最近两次采样的存活数量差除以实际秒数；负值表示净释放，持续增长是排查线索，不是泄漏归因" />
            </div>
            {system?.filePoolError && <div role="alert" style={{ fontSize: 11, color: C.conflict }}>File 池标签读取失败：{system.filePoolError} · 将自动重试</div>}
            <div style={{ ...hintStyle, marginTop: 10 }}>数量为 File 标签存活分配块；非文件句柄数，不代表本工具独占或已证明泄漏。</div>
          </section>
        </div>
        <MemoryTotals system={system} />
        <ResourceProcessTree snapshot={snapshot} />
      </div>
    </>
  );
}

function SessionStrip({ state, summary }: { state: ResourceMonitorState | null; summary: SessionSummary | null }) {
  const items = [
    `会话开始 ${state?.startedAt ? new Date(state.startedAt).toLocaleTimeString() : '—'}`,
    `运行 ${summary ? formatDuration(summary.elapsedMillis) : '—'}`,
    `已采样 ${state?.sampleCount ?? 0} 次${summary && summary.sampleCount > 1 ? `（间隔 ${formatDuration(summary.averageIntervalMillis)}）` : ''}`,
    state === null ? '尚未采样' : state.live ? '面板刷新：每 5 秒' : '后台：每 30 秒',
  ];
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 14px', padding: '10px 16px', borderBottom: `1px solid ${C.border}`, background: C.panel2, fontSize: 11, color: C.textSecondary }}>
      {items.map((item, index) => (
        <span key={item} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {index > 0 && <span aria-hidden="true" style={{ width: 1, height: 14, background: C.border }} />}
          <span>{item}</span>
        </span>
      ))}
    </div>
  );
}

// Rule: 卡片右上角的 › 只是范围提示（进程指标 / 全系统指标），没有下级视图，保持不可点击。
function CardHead({ icon, title, subtitle, hint = '' }: { icon: ReactNode; title: string; subtitle?: string; hint?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
      <span style={{ display: 'flex', marginTop: 2, flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary }}>{title}</div>
        {subtitle && <div style={{ marginTop: 3, ...hintStyle }}>{subtitle}</div>}
      </div>
      <span aria-hidden="true" style={{ ...hintStyle, whiteSpace: 'nowrap' }}>{hint ? `${hint} ›` : '›'}</span>
    </div>
  );
}

function Dot({ color }: { color: string }) {
  return <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />;
}

function Metric({ label, icon, value, size = 20, hints = [], title }: { label: string; icon?: ReactNode; value: string; size?: number; hints?: string[]; title?: string }) {
  return <div title={title} style={{ minWidth: 0 }}>
    <div style={labelStyle}>{icon}{label}</div>
    <div style={{ color: C.textPrimary, fontSize: size, fontWeight: 600, fontFamily: mono, fontVariantNumeric: 'tabular-nums', marginTop: 6, whiteSpace: 'nowrap' }}>{value}</div>
    {hints.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 12px', marginTop: 6 }}>{hints.map(hint => <span key={hint} style={hintStyle}>{hint}</span>)}</div>}
  </div>;
}

function MemoryTotalItem({ label, value }: { label: string; value: string }) {
  return <span style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
    <span style={{ ...hintStyle, fontSize: 12 }}>{label}</span>
    <span style={{ color: C.textPrimary, fontSize: 15, fontWeight: 600, fontFamily: mono, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
  </span>;
}

function MemoryTotals({ system }: { system: ResourceSnapshot['system'] | null }) {
  const total = system?.totalBytes ?? null, available = system?.availableBytes ?? null;
  const usedPercent = total !== null && available !== null && total > 0 ? (total - available) / total * 100 : null;
  const divider = <span aria-hidden="true" style={{ width: 1, height: 18, background: C.border }} />;
  return (
    <section style={{ ...cardStyle, padding: '12px 16px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px 16px' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}><Gauge size={14} color={C.btnPrimary} />内存总体</span>
      {divider}
      <MemoryTotalItem label="可用物理内存" value={formatMemory(available)} />
      {divider}
      <MemoryTotalItem label="物理内存总量" value={formatMemory(total)} />
      {divider}
      <span style={{ display: 'flex', alignItems: 'center', gap: 10, flex: '1 1 300px', minWidth: 0 }}>
        <span style={{ ...hintStyle, fontSize: 12, whiteSpace: 'nowrap' }}>使用率</span>
        <span style={{ color: C.textPrimary, fontSize: 15, fontWeight: 600, fontFamily: mono, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{usedPercent === null ? '—' : `${usedPercent.toFixed(1)}%`}</span>
        <span role="progressbar" aria-label="物理内存使用率" aria-valuemin={0} aria-valuemax={100} aria-valuenow={usedPercent === null ? undefined : Math.round(usedPercent)}
          style={{ flex: 1, minWidth: 80, height: 8, borderRadius: 4, background: C.panel3, overflow: 'hidden' }}>
          <span style={{ display: 'block', width: `${usedPercent ?? 0}%`, height: '100%', borderRadius: 4, background: C.btnPrimary }} />
        </span>
      </span>
    </section>
  );
}

export interface TrendSeries {
  label: string;
  color: string;
  dashed?: boolean;
  select: (sample: ResourceSample) => number | null;
}

export function Trend({ title, samples, series }: { title: string; samples: ResourceSample[]; series: TrendSeries[] }) {
  const values: number[] = [];
  for (const sample of samples) for (const item of series) { const value = item.select(sample); if (value !== null) values.push(value); }
  const top = values.length ? Math.max(...values) : 0;
  const maximum = top > 0 ? top * 1.1 : 1;
  const start = samples[0]?.elapsedMillis ?? 0, end = samples.at(-1)?.elapsedMillis ?? start;
  const points = (select: TrendSeries['select']) => samples.flatMap(sample => {
    const value = select(sample);
    return value === null ? [] : [[end > start ? (sample.elapsedMillis - start) / (end - start) * 520 : 260, 142 - value / maximum * 124]];
  });
  const draw = (item: TrendSeries) => {
    const line = points(item.select);
    if (line.length === 1) return <circle key={item.label} cx={line[0]?.[0]} cy={line[0]?.[1]} r={3} fill={item.color} />;
    return <polyline key={item.label} points={line.map(point => point.join(',')).join(' ')} fill="none" stroke={item.color} strokeWidth={2} strokeDasharray={item.dashed ? '5 4' : undefined} />;
  };
  return <div>
    {series.length > 1 && <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 10, color: C.textSecondary }}>{series.map(item => <span key={item.label} style={{ display: 'flex', gap: 5, alignItems: 'center' }}><span style={{ width: 14, borderTop: `2px ${item.dashed ? 'dashed' : 'solid'} ${item.color}` }} />{item.label}</span>)}</div>}
    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
      <div style={{ position: 'relative', width: 54, flexShrink: 0, fontSize: 10, color: C.textSecondary }}><span style={{ position: 'absolute', top: 12 }}>{values.length ? formatMemory(maximum) : '—'}</span><span style={{ position: 'absolute', bottom: 0 }}>0</span></div>
      <div style={{ minWidth: 0, flex: 1, position: 'relative' }}>
        <svg role="img" aria-label={`${title}趋势`} viewBox="0 0 520 146" preserveAspectRatio="none" style={{ width: '100%', height: 146, display: 'block' }}>
          <title>{`${title}，横轴为本次会话时间，纵轴为内存大小`}</title>
          {[18, 80, 142].map(y => <line key={y} x1={0} x2={520} y1={y} y2={y} stroke={C.border} strokeDasharray="3 5" />)}
          {series.map(draw)}
        </svg>
        {!samples.length && <span style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', fontSize: 11, color: C.textSecondary }}>暂无采样</span>}
      </div>
    </div>
    {!!samples.length && <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: 62, marginTop: 10, fontSize: 10, color: C.textSecondary }}><span>{new Date(samples[0]!.capturedAt).toLocaleTimeString()}</span><span>{new Date(samples.at(-1)!.capturedAt).toLocaleTimeString()}</span></div>}
  </div>;
}
