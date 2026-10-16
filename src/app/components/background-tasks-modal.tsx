import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowLeft, ListTodo, Play, Plus, Square, X } from 'lucide-react';
import { useAppBackend } from '../application/backend-context';
import { useWindowActivity } from '../application/use-window-activity';
import type { AppSettings, Repo } from '../domain/types';
import { taskActive, taskKey, taskStatusLabel, type BackgroundTaskDefinition, type BackgroundTaskRequest, type BackgroundTaskState } from '../domain/background-task';
import type { BackgroundTaskController } from '../features/background-tasks/use-background-tasks';
import { createTaskLogView, taskErrorText, type TaskLogView } from '../features/background-tasks/task-log-view';
import { C } from '../theme';
import { INSPECTOR_BACKDROP_STYLE, INSPECTOR_DIALOG_STYLE } from './common';

const buttonStyle: CSSProperties = { background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 6, color: C.textPrimary, padding: '7px 10px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12 };
const inputStyle: CSSProperties = { background: C.appBg, border: `1px solid ${C.border}`, borderRadius: 6, color: C.textPrimary, padding: '8px 10px', width: '100%', boxSizing: 'border-box', fontSize: 12 };
const layoutStyle = '.background-task-list{width:280px;flex-shrink:0}.background-task-back{display:none!important}@media(max-width:850px){.background-task-list{width:100%;border-right:none!important}.background-tasks-body[data-details="true"] .background-task-list{display:none}.background-tasks-body[data-details="false"] .background-task-detail{display:none}.background-task-back{display:inline-flex!important}}';

type TaskRow = { key: string; request: BackgroundTaskRequest; definition?: BackgroundTaskDefinition; state?: BackgroundTaskState };

interface BackgroundTasksModalProps {
  repo: Repo | null;
  repos: Repo[];
  settings: AppSettings;
  controller: BackgroundTaskController;
  onSave: (repoId: string, tasks: BackgroundTaskDefinition[]) => void;
  onClose: () => void;
}

export function BackgroundTasksModal({ repo, repos, settings, controller, onSave, onClose }: BackgroundTasksModalProps) {
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width:850px)').matches);
  const [scope, setScope] = useState<'all' | 'project' | 'running'>('all');
  const [search, setSearch] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [editing, setEditing] = useState<BackgroundTaskDefinition | null>(null);
  const [editingRepo, setEditingRepo] = useState<Repo | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const definitions = editingRepo ? settings.backgroundTasks[editingRepo.id] ?? [] : [];
  const configuredRows: TaskRow[] = (scope === 'project' ? repos.filter(project => project.id === repo?.id) : repos).flatMap(project =>
    (settings.backgroundTasks[project.id] ?? []).map(definition => {
      const key = taskKey(project.id, definition.id);
      return { key, definition, state: controller.states[key], request: { taskId: definition.id, repoId: project.id, repoName: project.name, repoPath: project.path, name: definition.name, command: definition.command, workDir: definition.workDir } };
    }));
  const configuredKeys = new Set(configuredRows.map(row => row.key));
  const sessionRows = Object.values(controller.states).map(state => ({ key: taskKey(state.repoId, state.taskId), request: state, state }));
  const rows: TaskRow[] = scope === 'running'
    ? sessionRows.filter(row => taskActive(row.state))
    : scope === 'all' ? [...configuredRows, ...sessionRows.filter(row => !configuredKeys.has(row.key))] : configuredRows;
  const visible = rows.filter(row => `${row.request.name} ${row.request.command} ${row.request.repoName}`.toLowerCase().includes(search.toLowerCase()));
  const selected = visible.find(row => row.key === selectedKey) ?? visible[0];
  const active = taskActive(selected?.state);
  const busy = selected ? controller.pending.has(selected.key) || selected.state?.status === 'stopping' : false;

  useEffect(() => {
    const media = window.matchMedia('(max-width:850px)');
    const update = () => setNarrow(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const origin = document.activeElement;
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); }
      if (event.key !== 'Tab') return;
      const elements = dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input, textarea, select, [tabindex="0"]');
      const available = Array.from(elements ?? []).filter(element => element.getClientRects().length > 0);
      const first = available[0], last = available.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (origin instanceof HTMLElement && origin.isConnected) origin.focus();
    };
  }, []);

  const edit = (row?: TaskRow) => {
    const target = row ? repos.find(project => project.id === row.request.repoId) : repo;
    if (!target) return;
    setEditingRepo(target);
    setEditing(row?.definition ?? { id: crypto.randomUUID(), name: '', command: '', workDir: '.' });
    setFormError(null);
    setShowDetails(true);
  };
  const save = () => {
    if (!editing || !editingRepo) return;
    const next = { ...editing, name: editing.name.trim(), command: editing.command.trim(), workDir: editing.workDir.trim() || '.' };
    if (!next.name || !next.command) { setFormError('名称和命令不能为空'); return; }
    try {
      const index = definitions.findIndex(task => task.id === next.id);
      onSave(editingRepo.id, index < 0 ? [...definitions, next] : definitions.map(task => task.id === next.id ? next : task));
      setScope(scope === 'running' ? 'all' : scope);
      setSelectedKey(taskKey(editingRepo.id, next.id));
      setSearch('');
      setEditing(null);
      setFormError(null);
    } catch (failure) { setFormError(taskErrorText(failure)); }
  };
  const remove = async () => {
    if (!selected?.definition) return;
    if (!window.confirm(`确定删除后台任务“${selected.definition.name}”吗？\n任务配置及本轮日志将被删除，且无法恢复。`)) return;
    const { repoId, taskId } = selected.request;
    if (!await controller.forget(repoId, taskId)) return;
    try {
      onSave(repoId, (settings.backgroundTasks[repoId] ?? []).filter(task => task.id !== taskId));
      setSelectedKey(null);
      setShowDetails(false);
    } catch (failure) { setFormError(taskErrorText(failure)); }
  };

  return (
    <>
      <style>{layoutStyle}</style>
      <div onClick={onClose} style={INSPECTOR_BACKDROP_STYLE} />
      <div ref={dialog} role="dialog" aria-modal="true" aria-label="后台任务" style={INSPECTOR_DIALOG_STYLE}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          <ListTodo size={16} color={C.btnPrimary} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: C.textPrimary, fontSize: 14, fontWeight: 600 }}>后台任务</div>
            <div title={scope === 'project' ? repo?.path : undefined} style={{ color: C.textSecondary, fontSize: 11, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{scope === 'project' ? repo?.name ?? '未选择项目' : scope === 'running' ? '全部项目运行中' : '全部项目任务'} · 收起窗口不会停止任务</div>
          </div>
          <button type="button" disabled={!repo} title={repo ? `添加到当前项目 ${repo.name}` : '未选择项目'} onClick={() => edit()} style={buttonStyle}><Plus size={13} />添加</button>
          <button ref={closeButton} type="button" onClick={onClose} aria-label="收起后台任务" title="收起，不停止任务" style={buttonStyle}><X size={16} /></button>
        </header>
        {controller.error && <div role="alert" style={{ padding: '8px 16px', color: C.conflict, fontSize: 12, whiteSpace: 'pre-wrap' }}>{controller.error} <button type="button" onClick={() => void controller.refresh()} style={buttonStyle}>刷新状态</button></div>}
        <div className="background-tasks-body" data-details={showDetails || !!editing} style={{ flex: 1, minHeight: 0, display: 'flex' }}>
          <aside className="background-task-list" style={{ display: 'flex', flexDirection: 'column', borderRight: `1px solid ${C.border}`, minHeight: 0 }}>
            <div style={{ padding: 12, display: 'grid', gap: 8 }}>
              <select aria-label="任务范围" value={scope} onChange={event => { setScope(event.target.value as typeof scope); setEditing(null); setSelectedKey(null); setShowDetails(false); }} style={inputStyle}>
                <option value="all">全部任务</option><option value="project">当前项目</option><option value="running">全部运行中</option>
              </select>
              <input aria-label="搜索任务" placeholder="搜索任务…" value={search} onChange={event => setSearch(event.target.value)} style={inputStyle} />
            </div>
            <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
              {visible.length === 0 && <div style={{ padding: 16, color: C.textSecondary, fontSize: 12 }}>{search ? '没有匹配的任务' : scope === 'running' ? '当前没有运行中的任务' : '还没有任务，点击“添加”保存项目命令。'}</div>}
              {visible.map(row => (
                <div key={row.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px', background: selected?.key === row.key && !editing ? C.selectedBg : 'transparent' }}>
                  <button type="button" aria-pressed={selected?.key === row.key && !editing} onClick={() => { setSelectedKey(row.key); setShowDetails(true); setEditing(null); setFormError(null); }} style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', padding: '8px 0', color: C.textPrimary, textAlign: 'left', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}><span title={row.request.name} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.request.name}</span><span style={{ color: row.state?.status === 'failed' ? C.conflict : taskActive(row.state) ? C.added : C.textSecondary, whiteSpace: 'nowrap', fontSize: 11 }}>{taskStatusLabel(row.state)}</span></div>
                    <div title={row.request.command} style={{ color: C.textSecondary, fontFamily: 'JetBrains Mono, monospace', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 5 }}>{scope !== 'project' ? `${row.request.repoName} · ` : ''}{row.request.command}</div>
                  </button>
                  {row.definition && !taskActive(row.state) && <button type="button" aria-label={`启动 ${row.request.name}`} disabled={controller.pending.has(row.key)} onClick={() => { setSelectedKey(row.key); setShowDetails(true); setEditing(null); void controller.start(row.request); }} style={buttonStyle}><Play size={12} /></button>}
                </div>
              ))}
            </div>
          </aside>
          <section className="background-task-detail" style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, minHeight: 0, background: C.appBg }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: `1px solid ${C.border}`, background: C.panel1 }}>
              <button className="background-task-back" type="button" onClick={() => { setShowDetails(false); setEditing(null); }} style={buttonStyle}><ArrowLeft size={13} />返回</button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: C.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{editing ? `任务配置 · ${editingRepo?.name}` : selected?.request.name ?? '选择任务'}</div>
                {!editing && selected && <div style={{ fontSize: 11, color: C.textSecondary, marginTop: 4 }}>{taskStatusLabel(selected.state)}{selected.state?.exitCode != null ? ` · 退出码 ${selected.state.exitCode}` : ''}</div>}
              </div>
              {!editing && selected && <>
                {selected.definition && !active && <button type="button" disabled={busy} onClick={() => edit(selected)} style={buttonStyle}>编辑</button>}
                {selected.definition && !active && <button type="button" disabled={busy} title="删除配置并丢弃本轮日志" onClick={() => void remove()} style={buttonStyle}>删除</button>}
                {(active || selected.definition) && <button type="button" title={active ? '结束此任务及其子进程' : '启动任务'} disabled={busy} onClick={() => void (active ? controller.stop(selected.request.repoId, selected.request.taskId) : controller.start(selected.request))} style={{ ...buttonStyle, color: active ? C.conflict : C.btnPrimary }}>
                  {active ? <Square size={12} /> : <Play size={12} />}{busy ? '处理中…' : active ? '停止' : '启动'}
                </button>}
              </>}
            </div>
            {editing ? <form onSubmit={event => { event.preventDefault(); save(); }} style={{ padding: 20, overflowY: 'auto', display: 'grid', gap: 14, alignContent: 'start' }}>
              {(settings.commandCenter.projectCommands[editingRepo?.id ?? ''] ?? []).length > 0 && <label style={{ color: C.textSecondary, fontSize: 12 }}>从项目命令复制<select aria-label="从项目命令复制" defaultValue="" onChange={event => {
                const command = settings.commandCenter.projectCommands[editingRepo!.id]?.find(item => item.id === event.target.value);
                if (command) setEditing({ ...editing, name: command.label, command: command.command });
              }} style={{ ...inputStyle, marginTop: 6 }}><option value="">选择已有命令…</option>{settings.commandCenter.projectCommands[editingRepo!.id]!.map(command => <option key={command.id} value={command.id}>{command.label}</option>)}</select></label>}
              <label style={{ color: C.textSecondary, fontSize: 12 }}>名称<input required aria-label="任务名称" value={editing.name} onChange={event => setEditing({ ...editing, name: event.target.value })} placeholder="例如：前端开发" style={{ ...inputStyle, marginTop: 6 }} /></label>
              <label style={{ color: C.textSecondary, fontSize: 12 }}>命令<textarea required aria-label="任务命令" value={editing.command} onChange={event => setEditing({ ...editing, command: event.target.value })} placeholder="npm run dev" rows={3} style={{ ...inputStyle, marginTop: 6, fontFamily: 'JetBrains Mono, monospace' }} /></label>
              <label style={{ color: C.textSecondary, fontSize: 12 }}>项目内工作目录<input aria-label="任务工作目录" value={editing.workDir} onChange={event => setEditing({ ...editing, workDir: event.target.value })} placeholder=". 或 frontend" style={{ ...inputStyle, marginTop: 6 }} /></label>
              <div style={{ color: C.textSecondary, fontSize: 11 }}>默认项目根目录。不支持交互输入；需要确认或选择的程序请在终端运行。</div>
              {formError && <div role="alert" style={{ color: C.conflict, whiteSpace: 'pre-wrap', fontSize: 12 }}>{formError}</div>}
              <div style={{ display: 'flex', gap: 8 }}><button type="submit" style={{ ...buttonStyle, color: C.btnPrimary }}>保存配置</button><button type="button" onClick={() => { setEditing(null); setFormError(null); }} style={buttonStyle}>取消</button></div>
            </form> : selected ? <>
              <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}`, fontSize: 11, color: C.textSecondary, overflowWrap: 'anywhere' }}><div style={{ fontFamily: 'JetBrains Mono, monospace', whiteSpace: 'pre-wrap', userSelect: 'text' }}>{selected.request.command}</div><div style={{ marginTop: 5 }}>{selected.request.repoName} · 工作目录：{selected.request.workDir || '.'}</div>{selected.state && (selected.state.command !== selected.request.command || selected.state.workDir !== selected.request.workDir) && <div style={{ marginTop: 5 }}>本轮日志来自：{selected.state.command} · 工作目录：{selected.state.workDir || '.'}</div>}</div>
              {(selected.state?.error || formError) && <div role="alert" style={{ padding: '8px 14px', color: C.conflict, fontSize: 12, whiteSpace: 'pre-wrap' }}>{selected.state?.error || formError}</div>}
              {selected.state && (!narrow || showDetails) ? <TaskLog key={`${selected.key}/${selected.state.runId}`} state={selected.state} /> : <div style={{ padding: 20, color: C.textSecondary, fontSize: 12 }}>任务尚未启动。点击“启动”后查看输出。</div>}
            </> : <div style={{ padding: 20, color: C.textSecondary, fontSize: 12 }}>添加一个项目任务，或查看其他项目运行中的任务。</div>}
            <footer style={{ marginTop: 'auto', padding: '8px 14px', borderTop: `1px solid ${C.border}`, color: C.textSecondary, fontSize: 11 }}>只保留最近 128 KiB 日志 · 不支持交互 · 退出应用停止任务</footer>
          </section>
        </div>
      </div>
    </>
  );
}

function TaskLog({ state }: { state: BackgroundTaskState }) {
  const backend = useAppBackend();
  const windowActive = useWindowActivity();
  const [view, setView] = useState<TaskLogView>({ text: '', truncated: false });
  const [error, setError] = useState<string | null>(null);
  const scroll = useRef<HTMLPreElement>(null);
  const follow = useRef(true);
  useEffect(() => {
    if (!windowActive) return;
    setView({ text: '', truncated: false });
    const reader = createTaskLogView({
      read: cursor => backend.readBackgroundTaskLog(state.repoId, state.taskId, state.runId, cursor),
      onView: setView, onError: setError, repeat: taskActive(state),
    });
    void reader.refresh();
    return () => reader.dispose();
  }, [backend, windowActive, state.repoId, state.taskId, state.runId, state.status]);
  useEffect(() => { if (follow.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight; }, [view.text]);
  return <>
    {view.truncated && <div role="status" style={{ padding: '6px 14px', color: C.modified, fontSize: 11 }}>较早日志已丢弃，仅显示最近输出。</div>}
    {error && <div role="alert" style={{ padding: '6px 14px', color: C.conflict, fontSize: 12 }}>{error}</div>}
    <pre ref={scroll} tabIndex={0} aria-label="任务日志" onScroll={event => { const node = event.currentTarget; follow.current = node.scrollHeight - node.scrollTop - node.clientHeight < 30; }} style={{ flex: 1, minHeight: 0, margin: 0, padding: 14, overflow: 'auto', color: C.textPrimary, fontFamily: 'JetBrains Mono, monospace', fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', userSelect: 'text' }}>{view.text || (windowActive ? '暂无日志输出' : '窗口失焦，已暂停日志读取')}</pre>
  </>;
}
