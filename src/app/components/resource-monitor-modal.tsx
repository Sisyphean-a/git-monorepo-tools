import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Activity, AlertTriangle, X } from 'lucide-react';
import { useAppBackend } from '../application/backend-context';
import { createResourceMonitorView } from '../application/resource-monitor-view';
import { formatCountRate, formatDelta, formatDuration, formatMemory, summarizeSession, type ResourceMonitorState, type ResourceSample } from '../domain/resource-monitor';
import { ResourceProcessTree } from './resource-process-tree';
import { C } from '../theme';
import { INSPECTOR_BACKDROP_STYLE, INSPECTOR_DIALOG_STYLE } from './common';

const mono = 'JetBrains Mono, monospace';
const sectionStyle: CSSProperties = { padding: 20, background: C.panel1, border: `1px solid ${C.border}`, borderRadius: 8, minWidth: 0 };
const smallLabel: CSSProperties = { color: C.textSecondary, fontSize: 11 };

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

export function ResourceMonitorContent({ state, error }: { state: ResourceMonitorState | null; error: string | null }) {
  const snapshot = state?.snapshot ?? null;
  const summary = state ? summarizeSession(state) : null;
  const mainCpu = snapshot?.main.cpuPercent ?? null;
  const file = snapshot?.system.filePool ?? null;
  const fileError = snapshot?.system.filePoolError;
  return (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 18px', padding: '10px 16px', borderBottom: `1px solid ${C.border}`, background: C.panel2, fontSize: 11, color: C.textSecondary }}>
        <span>会话开始 {state?.startedAt ? new Date(state.startedAt).toLocaleTimeString() : '—'}</span>
        <span>已运行 {summary ? formatDuration(summary.elapsedMillis) : '—'}</span>
        <span>已采样 {state?.sampleCount ?? 0} 次{summary && summary.sampleCount > 1 ? ` · 平均间隔 ${formatDuration(summary.averageIntervalMillis)}` : ''}</span>
        <span>{state?.live ? '面板打开：每 5 秒（含子进程明细）' : '后台：每 30 秒'}</span>
      </div>
      <div style={{ padding: 16 }}>
        {error && <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.conflict, background: `${C.conflict}12`, border: `1px solid ${C.conflict}40`, borderRadius: 6, padding: '10px 12px', marginBottom: 14, fontSize: 12 }}><AlertTriangle size={14} />{error} · 已保留上次采样，将自动重试</div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(420px, 100%), 1fr))', gap: 14 }}>
          <section style={sectionStyle}>
            <SectionTitle title="本工具 · 主进程" detail="进程指标" />
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', margin: '18px 0' }}>
              <Metric label="私有提交" value={formatMemory(snapshot?.main.privateBytes ?? null)} primary
                hint={summary ? `较启动 ${formatDelta(summary.private.delta)} · 峰值 ${formatMemory(summary.peakPrivateBytes)}` : '等待采样'}
                title="此进程独占的已提交内存，不等于物理驻留内存" />
              <Metric label="工作集" value={formatMemory(snapshot?.main.workingSetBytes ?? null)} title="当前驻留物理内存，包含共享页面" />
              <Metric label="CPU" value={mainCpu === null ? '—' : `${mainCpu.toFixed(1)}%`}
                hint={summary?.averageCpuPercent == null ? '首次采样无对比' : `会话平均 ${summary.averageCpuPercent.toFixed(1)}%${summary.peakCpuPercent == null ? '' : ` · 峰值 ${summary.peakCpuPercent.toFixed(1)}%`}`}
                title="相邻采样间的 CPU 使用率，按逻辑核数归一化；首次采样无值" />
            </div>
            <Trend title="主进程内存" samples={state?.samples ?? []} first={sample => sample.privateBytes} second={sample => sample.heapBytes} firstLabel="私有提交" secondLabel="Go 堆" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 18, marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
              <Metric label="Go 堆" value={formatMemory(snapshot?.go.heapBytes ?? null)} hint={summary ? `较启动 ${formatDelta(summary.heap.delta)}` : undefined} />
              <Metric label="Go 已取得内存" value={formatMemory(snapshot?.go.reservedBytes ?? null)} title="Go 运行时向系统取得的内存，不是进程工作集" />
              <Metric label="句柄" value={snapshot?.main.handleCount?.toLocaleString() ?? '—'} />
              <Metric label="Goroutine" value={snapshot?.go.goroutines.toLocaleString() ?? '—'} />
              <Metric label="堆对象" value={snapshot?.go.heapObjects.toLocaleString() ?? '—'} />
              <Metric label="GC 次数" value={snapshot?.go.gcCount.toLocaleString() ?? '—'} />
            </div>
          </section>
          <section style={sectionStyle}>
            <SectionTitle title="系统内存" detail="全系统指标" />
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', margin: '18px 0' }}>
              <Metric label="非分页池" value={formatMemory(snapshot?.system.nonpagedPoolBytes ?? null)} primary
                hint={summary ? `较启动 ${formatDelta(summary.nonpaged.delta)} · 峰值 ${formatMemory(summary.peakNonpagedPoolBytes)}` : '等待采样'} />
              <Metric label="分页池" value={formatMemory(snapshot?.system.pagedPoolBytes ?? null)} hint={summary ? `较启动 ${formatDelta(summary.paged.delta)}` : undefined} />
              <Metric label="非分页池变化" value={summary?.nonpaged.perMinute == null ? '—' : `${formatDelta(summary.nonpaged.perMinute)}/min`}
                title="本次会话已保留采样的平均变化率，不代表本工具造成的增长" />
            </div>
            <Trend title="系统内核池" samples={state?.samples ?? []} first={sample => sample.nonpagedPoolBytes} second={sample => sample.pagedPoolBytes} firstLabel="非分页池" secondLabel="分页池" />
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
              <h3 style={{ margin: 0, fontSize: 12, fontWeight: 600 }}>File 内核对象 · 全系统池标签</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, margin: '16px 0 10px' }}>
                <Metric label="存活数量" value={file?.count.toLocaleString() ?? '—'} title="全系统 File 标签的累计分配减累计释放，统计存活分配块，不是文件句柄数量" />
                <Metric label="占用内存" value={formatMemory(file?.bytes ?? null)}
                  hint={file && summary ? `较首次有效采样 ${formatDelta(summary.fileBytes.delta)}` : undefined} title="File 标签的分页池与非分页池占用合计，不能归属到本工具" />
                <Metric label="每秒净增长" value={formatCountRate(file?.netPerSecond ?? null)}
                  hint={file && summary?.fileCount.perMinute != null ? `会话平均 ${formatCountRate(summary.fileCount.perMinute / 60)}` : '首次或上次未采集时无对比'}
                  title="最近两次采样的存活数量差除以实际秒数；负值表示净释放，持续增长是排查线索，不是泄漏归因" />
              </div>
              {fileError && <div role="alert" style={{ fontSize: 11, color: C.conflict, marginBottom: 8 }}>File 池标签读取失败：{fileError} · 将自动重试</div>}
              <div style={{ ...smallLabel, fontSize: 10 }}>数量为 File 标签存活分配块；非文件句柄数，不代表本工具独占或已证明泄漏。</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 18, marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
              <Metric label="可用物理内存" value={formatMemory(snapshot?.system.availableBytes ?? null)} />
              <Metric label="物理内存总量" value={formatMemory(snapshot?.system.totalBytes ?? null)} />
            </div>
          </section>
        </div>
        <ResourceProcessTree snapshot={snapshot} />
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, padding: '12px 4px 0', fontSize: 10, color: C.textSecondary }}>
          <span>系统内核池不归属于某个应用；这里只读监控，不清理内存。</span>
          <span>{state ? `更新于 ${new Date(snapshot?.capturedAt ?? state.startedAt).toLocaleTimeString()} · 历史自动降采样保留全程趋势` : '尚未采样'}</span>
        </div>
      </div>
    </>
  );
}

function SectionTitle({ title, detail }: { title: string; detail: string }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><h2 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: C.textPrimary }}>{title}</h2><span style={{ ...smallLabel, fontSize: 10 }}>{detail}</span></div>;
}

function Metric({ label, value, primary = false, hint, title }: { label: string; value: string; primary?: boolean; hint?: string; title?: string }) {
  return <div title={title} style={{ minWidth: 0 }}>
    <div style={smallLabel}>{label}</div>
    <div style={{ color: C.textPrimary, fontSize: primary ? 28 : 17, fontWeight: primary ? 600 : 500, fontFamily: mono, fontVariantNumeric: 'tabular-nums', marginTop: 7, whiteSpace: 'nowrap' }}>{value}</div>
    {hint && <div style={{ ...smallLabel, fontSize: 10, marginTop: 5, whiteSpace: 'nowrap' }}>{hint}</div>}
  </div>;
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
          <title>{`${title}，横轴为本次会话时间，纵轴为内存大小`}</title>
          {[18, 80, 142].map(y => <line key={y} x1={0} x2={520} y1={y} y2={y} stroke={C.border} strokeDasharray="3 5" />)}
          {draw(first, C.btnPrimary)}{draw(second, C.textSecondary, true)}
        </svg>
        {!samples.length && <span style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', fontSize: 11, color: C.textSecondary }}>暂无采样</span>}
      </div>
    </div>
    {!!samples.length && <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: 62, marginTop: 10, fontSize: 10, color: C.textSecondary }}><span>{new Date(samples[0]!.capturedAt).toLocaleTimeString()}</span><span>{new Date(samples.at(-1)!.capturedAt).toLocaleTimeString()}</span></div>}
  </div>;
}
