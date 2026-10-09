import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Activity, AlertTriangle, RefreshCw, X } from 'lucide-react';
import { useAppBackend } from '../application/backend-context';
import { useWindowActivity } from '../application/use-window-activity';
import { createResourceMonitorPolling } from '../application/resource-monitor-polling';
import { appendResourceSample, formatMemory, poolGrowthPerMinute, processCPUPercent, type MonitoredProcess, type ResourceSample, type ResourceSnapshot } from '../domain/resource-monitor';
import { C } from '../theme';
import { INSPECTOR_BACKDROP_STYLE, INSPECTOR_DIALOG_STYLE } from './common';

const mono = 'JetBrains Mono, monospace';
const sectionStyle: CSSProperties = { padding: 20, background: C.panel1, border: `1px solid ${C.border}`, borderRadius: 8, minWidth: 0 };
const smallLabel: CSSProperties = { color: C.textSecondary, fontSize: 11 };

export function ResourceMonitorModal({ onClose }: { onClose: () => void }) {
  const backend = useAppBackend();
  const active = useWindowActivity();
  const [snapshot, setSnapshot] = useState<ResourceSnapshot | null>(null);
  const [previous, setPrevious] = useState<ResourceSnapshot | null>(null);
  const [samples, setSamples] = useState<ResourceSample[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef<ResourceSnapshot | null>(null);
  const poller = useRef<ReturnType<typeof createResourceMonitorPolling> | null>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const session = createResourceMonitorPolling({
      fetch: () => backend.fetchResourceSnapshot(),
      onSnapshot: next => {
        setPrevious(latest.current);
        latest.current = next;
        setSnapshot(next);
        setSamples(history => appendResourceSample(history, next));
        setError(null);
      },
      onPending: setPending,
      onError: failure => setError(failure instanceof Error ? failure.message : typeof failure === 'string' ? failure : JSON.stringify(failure) ?? '资源采样失败'),
    });
    poller.current = session;
    return () => { session.dispose(); poller.current = null; };
  }, [backend]);

  useEffect(() => { poller.current?.setActive(active); }, [active, backend]);

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

  const elapsed = snapshot && previous ? snapshot.elapsedMillis - previous.elapsedMillis : 0;
  const cpu = snapshot ? processCPUPercent(snapshot.main, previous?.main, elapsed, snapshot.logicalCpus) : null;
  const growth = poolGrowthPerMinute(samples);
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
          <span role="status" style={{ color: error ? C.conflict : C.textSecondary, fontSize: 11 }}>
            {!active ? '窗口失焦 · 已暂停' : error ? snapshot ? '采样失败 · 数据已过期' : '采样失败' : pending ? '采样中…' : '实时采样'}
          </span>
          <button type="button" disabled={pending || !active} onClick={() => void poller.current?.refresh()} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 6, background: C.panel2, border: `1px solid ${C.border}`, color: C.textSecondary, cursor: pending || !active ? 'default' : 'pointer', opacity: pending || !active ? 0.6 : 1, fontSize: 11 }}><RefreshCw size={12} />刷新</button>
          <button ref={closeButton} type="button" onClick={onClose} aria-label="关闭资源监控" title="关闭" style={{ display: 'flex', padding: 4, background: 'none', border: 'none', color: C.textSecondary, cursor: 'pointer' }}><X size={17} /></button>
        </header>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 16 }}>
          {error && <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.conflict, background: `${C.conflict}12`, border: `1px solid ${C.conflict}40`, borderRadius: 6, padding: '10px 12px', marginBottom: 14, fontSize: 12 }}><AlertTriangle size={14} />{error} · 可点击刷新重试</div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(420px, 100%), 1fr))', gap: 14 }}>
            <section style={sectionStyle}>
              <SectionTitle title="本工具 · 主进程" detail="进程指标" />
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', margin: '20px 0' }}>
                <Metric label="私有提交" value={formatMemory(snapshot?.main.privateBytes ?? null)} primary title="此进程独占的已提交内存，不等于物理驻留内存" />
                <Metric label="工作集" value={formatMemory(snapshot?.main.workingSetBytes ?? null)} title="当前驻留物理内存，包含共享页面" />
                <Metric label="CPU" value={cpu === null ? '—' : `${cpu.toFixed(1)}%`} title="相邻采样间的 CPU 使用率，按逻辑核数归一化；首次采样无值" />
              </div>
              <Trend title="主进程内存" samples={samples} first={sample => sample.privateBytes} second={sample => sample.heapBytes} firstLabel="私有提交" secondLabel="Go 堆" />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 18, marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
                <Metric label="Go 堆" value={formatMemory(snapshot?.go.heapBytes ?? null)} />
                <Metric label="Go 已取得内存" value={formatMemory(snapshot?.go.reservedBytes ?? null)} title="Go 运行时向系统取得的内存，不是进程工作集" />
                <Metric label="句柄" value={snapshot?.main.handleCount?.toLocaleString() ?? '—'} />
                <Metric label="Goroutine" value={snapshot?.go.goroutines.toLocaleString() ?? '—'} />
                <Metric label="堆对象" value={snapshot?.go.heapObjects.toLocaleString() ?? '—'} />
                <Metric label="GC 次数" value={snapshot?.go.gcCount.toLocaleString() ?? '—'} />
              </div>
            </section>
            <section style={sectionStyle}>
              <SectionTitle title="系统内存" detail="全系统指标" />
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', margin: '20px 0' }}>
                <Metric label="非分页池" value={formatMemory(snapshot?.system.nonpagedPoolBytes ?? null)} primary />
                <Metric label="分页池" value={formatMemory(snapshot?.system.pagedPoolBytes ?? null)} />
                <Metric label="非分页池变化" value={growth === null ? '—' : `${growth > 0 ? '+' : growth < 0 ? '−' : ''}${formatMemory(Math.abs(growth))}/min`} title="本次打开期间、已保留采样的平均变化率，不代表本工具造成的增长" />
              </div>
              <Trend title="系统内核池" samples={samples} first={sample => sample.nonpagedBytes} second={sample => sample.pagedBytes} firstLabel="非分页池" secondLabel="分页池" />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 18, marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
                <Metric label="可用物理内存" value={formatMemory(snapshot?.system.availableBytes ?? null)} />
                <Metric label="物理内存总量" value={formatMemory(snapshot?.system.totalBytes ?? null)} />
              </div>
            </section>
          </div>
          <ProcessTable snapshot={snapshot} previous={previous} elapsed={elapsed} />
        </div>
        <footer style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, padding: '10px 16px', fontSize: 10, color: C.textSecondary, borderTop: `1px solid ${C.border}` }}>
          <span>系统内核池不归属于某个应用；这里只读监控，不清理内存。</span>
          <span>每 5 秒采样 · 最近 60 次 · {snapshot ? `更新于 ${new Date(snapshot.capturedAt).toLocaleTimeString()}` : '尚未采样'}</span>
        </footer>
      </div>
    </>
  );
}

function SectionTitle({ title, detail }: { title: string; detail: string }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><h2 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: C.textPrimary }}>{title}</h2><span style={{ ...smallLabel, fontSize: 10 }}>{detail}</span></div>;
}

function Metric({ label, value, primary = false, title }: { label: string; value: string; primary?: boolean; title?: string }) {
  return <div title={title} style={{ minWidth: 0 }}><div style={smallLabel}>{label}</div><div style={{ color: C.textPrimary, fontSize: primary ? 28 : 17, fontWeight: primary ? 600 : 500, fontFamily: mono, fontVariantNumeric: 'tabular-nums', marginTop: 7, whiteSpace: 'nowrap' }}>{value}</div></div>;
}

export function Trend({ title, samples, first, second, firstLabel, secondLabel }: { title: string; samples: ResourceSample[]; first: (sample: ResourceSample) => number | null; second: (sample: ResourceSample) => number | null; firstLabel: string; secondLabel: string }) {
  const values = samples.flatMap(sample => [first(sample), second(sample)]).filter((value): value is number => value !== null);
  const top = values.length ? Math.max(...values) : 0;
  const maximum = top > 0 ? top * 1.1 : 1;
  const start = samples[0]?.elapsedMillis ?? 0, end = samples.at(-1)?.elapsedMillis ?? start;
  const points = (select: (sample: ResourceSample) => number | null) => samples.flatMap(sample => {
    const value = select(sample);
    return value === null ? [] : [[end > start ? (sample.elapsedMillis - start) / (end - start) * 520 : 260, 142 - value / maximum * 124]];
  });
  const draw = (select: (sample: ResourceSample) => number | null, color: string, dashed = false) => {
    const series = points(select);
    if (series.length === 1) return <circle cx={series[0]?.[0]} cy={series[0]?.[1]} r={3} fill={color} />;
    return <polyline points={series.map(point => point.join(',')).join(' ')} fill="none" stroke={color} strokeWidth={2} strokeDasharray={dashed ? '5 4' : undefined} />;
  };
  return <div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 10, color: C.textSecondary, marginBottom: 4 }}><span style={{ display: 'flex', gap: 5, alignItems: 'center' }}><span style={{ width: 14, borderTop: `2px solid ${C.btnPrimary}` }} />{firstLabel}</span><span style={{ display: 'flex', gap: 5, alignItems: 'center' }}><span style={{ width: 14, borderTop: `2px dashed ${C.textSecondary}` }} />{secondLabel}</span></div>
    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
      <div style={{ position: 'relative', width: 54, flexShrink: 0, fontSize: 10, color: C.textSecondary }}><span style={{ position: 'absolute', top: 12 }}>{values.length ? formatMemory(maximum) : '—'}</span><span style={{ position: 'absolute', bottom: 0 }}>0</span></div>
      <div style={{ minWidth: 0, flex: 1, position: 'relative' }}>
        <svg role="img" aria-label={`${title}趋势`} viewBox="0 0 520 146" preserveAspectRatio="none" style={{ width: '100%', height: 146, display: 'block' }}>
          <title>{`${title}，横轴为采样时间，纵轴为内存大小`}</title>
          {[18, 80, 142].map(y => <line key={y} x1={0} x2={520} y1={y} y2={y} stroke={C.border} strokeDasharray="3 5" />)}
          {draw(first, C.btnPrimary)}{draw(second, C.textSecondary, true)}
        </svg>
        {!samples.length && <span style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', fontSize: 11, color: C.textSecondary }}>暂无采样</span>}
      </div>
    </div>
    {!!samples.length && <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: 62, marginTop: 10, fontSize: 10, color: C.textSecondary }}><span>{new Date(samples[0]!.capturedAt).toLocaleTimeString()}</span><span>{new Date(samples.at(-1)!.capturedAt).toLocaleTimeString()}</span></div>}
  </div>;
}

function ProcessTable({ snapshot, previous, elapsed }: { snapshot: ResourceSnapshot | null; previous: ResourceSnapshot | null; elapsed: number }) {
  const rows = snapshot?.children ?? [];
  const previousByPID = new Map(previous?.children.map(process => [process.pid, process]) ?? []);
  const total = rows.some(row => row.privateBytes === null) ? null : rows.reduce((sum, row) => sum + (row.privateBytes ?? 0), 0);
  const cell: CSSProperties = { padding: '10px 12px', borderBottom: `1px solid ${C.border}`, textAlign: 'right', whiteSpace: 'nowrap', fontFamily: mono, fontSize: 11, color: C.textSecondary };
  return <section style={{ ...sectionStyle, padding: 0, marginTop: 14 }}>
    <div style={{ display: 'flex', gap: 16, justifyContent: 'space-between', padding: '14px 16px', borderBottom: `1px solid ${C.border}`, flexWrap: 'wrap' }}><h2 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>子进程 · {rows.length}</h2><span style={smallLabel}>当前进程树 · 私有提交合计 {snapshot ? formatMemory(total) : '—'}</span></div>
    <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead><tr>{['进程', 'PID', '私有提交', '工作集（含共享）', 'CPU', '句柄'].map((label, index) => <th key={label} style={{ ...cell, textAlign: index === 0 ? 'left' : 'right', background: C.panel2, fontFamily: 'inherit', fontWeight: 500 }}>{label}</th>)}</tr></thead>
      <tbody>{rows.map((row: MonitoredProcess) => {
        const cpu = processCPUPercent(row, previousByPID.get(row.pid), elapsed, snapshot?.logicalCpus ?? 1);
        return <tr key={`${row.pid}:${row.createdAt}`} title={row.error}><td style={{ ...cell, textAlign: 'left' }}><span style={{ color: C.textPrimary }}>{row.name}</span>{row.error && <div style={{ fontSize: 10, color: C.conflict, marginTop: 4, whiteSpace: 'normal' }}>读取失败：{row.error}</div>}</td><td style={cell}>{row.pid}</td><td style={cell}>{formatMemory(row.privateBytes)}</td><td style={cell}>{formatMemory(row.workingSetBytes)}</td><td style={cell}>{cpu === null ? '—' : `${cpu.toFixed(1)}%`}</td><td style={cell}>{row.handleCount?.toLocaleString() ?? '—'}</td></tr>;
      })}</tbody>
    </table>{!rows.length && <div style={{ padding: 24, textAlign: 'center', ...smallLabel }}>{snapshot ? '当前没有子进程' : '尚无进程数据'}</div>}</div>
  </section>;
}
