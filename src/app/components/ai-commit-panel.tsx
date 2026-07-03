import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, Copy, Settings2 } from 'lucide-react';
import { C } from '../theme';
import { ToolbarBtn } from './workspace-parts';

export interface PanelAction {
  key: string;
  label: string;
  icon: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  primary?: boolean;
  accent?: boolean;
  warning?: boolean;
  dimmed?: boolean;
}

export interface PanelActionGroup {
  key: string;
  actions: PanelAction[];
}

export interface PanelCommandSection {
  key: string;
  label: string;
  actions: PanelAction[];
  onManage?: () => void;
}

export interface CommandConsoleState {
  title: string;
  command: string;
  status: 'running' | 'success' | 'failed';
  output: string;
  startedAt: number;
  endedAt?: number;
}

interface AiCommitPanelProps {
  topAction?: PanelAction;
  message: string;
  error: string | null;
  actionGroups: PanelActionGroup[];
  commandSections: PanelCommandSection[];
  commandConsole: CommandConsoleState | null;
  onMessageChange: (message: string) => void;
  onClearConsole: () => void;
}

function MessageEditor({ message, error, onMessageChange }: Pick<AiCommitPanelProps, 'message' | 'error' | 'onMessageChange'>) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ color: C.textSecondary, fontSize: 11, fontWeight: 600 }}>
        提交信息
        {message && <span style={{ color: C.textWeak, fontWeight: 400, marginLeft: 6 }}>(可编辑)</span>}
      </div>
      <textarea
        rows={3}
        value={message}
        onChange={e => onMessageChange(e.target.value)}
        placeholder="输入提交信息…"
        style={{
          width: '100%',
          height: 84,
          background: C.panel2,
          border: `1px solid ${C.border}`,
          borderRadius: 7,
          padding: '10px 12px',
          color: message ? C.textPrimary : C.textWeak,
          fontSize: 12,
          fontFamily: 'JetBrains Mono, monospace',
          outline: 'none',
          resize: 'none',
          boxSizing: 'border-box',
          lineHeight: 1.6,
        }}
        onFocus={e => {
          e.target.style.borderColor = C.btnPrimary;
        }}
        onBlur={e => {
          e.target.style.borderColor = C.border;
        }}
      />
      {error && (
        <div style={{ color: C.conflict, fontSize: 11, lineHeight: 1.5 }}>
          {error}
        </div>
      )}
    </div>
  );
}

function ActionCluster({ actionGroups }: Pick<AiCommitPanelProps, 'actionGroups'>) {
  return (
    <div style={{ background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 10, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {actionGroups.map(group => (
        <div key={group.key} style={{ display: 'grid', gridTemplateColumns: `repeat(${group.actions.length}, minmax(0, 1fr))`, gap: 8 }}>
          {group.actions.map(action => (
            <ToolbarBtn
              key={action.key}
              label={action.label}
              icon={action.icon}
              onClick={action.onClick}
              disabled={action.disabled}
              primary={action.primary}
              accent={action.accent}
              warning={action.warning}
              dimmed={action.dimmed}
              style={{ width: '100%', justifyContent: 'center', padding: '7px 10px', minWidth: 0 }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function CommandSection({ section }: { section: PanelCommandSection }) {
  if (section.actions.length === 0) return null;
  return (
    <div style={{ background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 10, padding: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ color: C.textSecondary, fontSize: 11, fontWeight: 600 }}>{section.label}</span>
        {section.onManage && (
          <button onClick={section.onManage} style={{ background: 'none', border: 'none', color: C.textWeak, cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center' }}>
            <Settings2 size={12} />
          </button>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
        {section.actions.map(action => (
          <ToolbarBtn
            key={action.key}
            label={action.label}
            icon={action.icon}
            onClick={action.onClick}
            disabled={action.disabled}
            primary={action.primary}
            accent={action.accent}
            warning={action.warning}
            dimmed={action.dimmed}
            style={{ width: '100%', justifyContent: 'center', padding: '7px 10px', minWidth: 0 }}
          />
        ))}
      </div>
    </div>
  );
}

function CommandConsole({
  commandConsole,
  onClear,
}: {
  commandConsole: CommandConsoleState | null;
  onClear: () => void;
}) {
  const [expanded, setExpanded] = useState(Boolean(commandConsole));
  const outputRef = useRef<HTMLPreElement | null>(null);

  useEffect(() => {
    if (commandConsole) setExpanded(true);
  }, [commandConsole?.startedAt]);

  useEffect(() => {
    if (!expanded) return;
    const frame = requestAnimationFrame(() => {
      const element = outputRef.current;
      if (element) {
        element.scrollTop = element.scrollHeight;
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [expanded, commandConsole?.startedAt, commandConsole?.output]);

  const handleCopy = () => {
    if (!commandConsole) return;
    const text = [`$ ${commandConsole.command}`, commandConsole.output].filter(Boolean).join('\n');
    navigator.clipboard.writeText(text).catch(() => {});
  };

  const statusColor = commandConsole?.status === 'failed'
    ? C.deleted
    : commandConsole?.status === 'success'
      ? C.added
      : C.needPull;

  return (
    <div style={{ background: C.panel2, borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px' }}>
        <button onClick={() => setExpanded(value => !value)} style={{ background: 'none', border: 'none', color: C.textSecondary, cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
          {expanded ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
          <span style={{ fontSize: 11, fontWeight: 600 }}>输出</span>
        </button>
        {commandConsole && (
          <>
            <span style={{ width: 7, height: 7, borderRadius: 999, background: statusColor, display: 'inline-block' }} />
            <span style={{ color: C.textWeak, fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
              {commandConsole.title}
            </span>
          </>
        )}
        {commandConsole && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
            <button onClick={handleCopy} style={{ background: 'none', border: 'none', color: C.textWeak, cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center' }}>
              <Copy size={12} />
            </button>
            <button onClick={onClear} style={{ background: 'none', border: 'none', color: C.textWeak, cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center', fontSize: 10 }}>
              清空
            </button>
          </div>
        )}
      </div>
      {expanded && (
        <pre
          ref={outputRef}
          style={{
            margin: 0,
            minHeight: 120,
            maxHeight: 220,
            padding: '0 12px 12px',
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            color: commandConsole ? C.textSecondary : C.textWeak,
            fontSize: 11,
            lineHeight: 1.65,
            fontFamily: 'JetBrains Mono, monospace',
          }}
        >
          {commandConsole ? `$ ${commandConsole.command}${commandConsole.output ? `\n${commandConsole.output}` : ''}` : ''}
        </pre>
      )}
    </div>
  );
}

export function AiCommitPanel({
  topAction,
  message,
  error,
  actionGroups,
  commandSections,
  commandConsole,
  onMessageChange,
  onClearConsole,
}: AiCommitPanelProps) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: C.appBg, overflow: 'hidden' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {topAction && (
          <ToolbarBtn
            label={topAction.label}
            icon={topAction.icon}
            onClick={topAction.onClick}
            disabled={topAction.disabled}
            primary={topAction.primary}
            accent={topAction.accent}
            warning={topAction.warning}
            dimmed={topAction.dimmed}
            style={{ width: '100%', justifyContent: 'center', padding: '8px 10px' }}
          />
        )}
        <MessageEditor message={message} error={error} onMessageChange={onMessageChange} />
        <ActionCluster actionGroups={actionGroups} />
        {commandSections.map(section => <CommandSection key={section.key} section={section} />)}
        <div style={{ flex: 1, minHeight: 0 }} />
      </div>
      <CommandConsole commandConsole={commandConsole} onClear={onClearConsole} />
    </div>
  );
}
