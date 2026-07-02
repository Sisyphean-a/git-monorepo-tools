import type { ReactNode } from 'react';
import { C } from '../theme';
import { ToolbarBtn } from './workspace-parts';

interface PanelAction {
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

interface PanelActionGroup {
  key: string;
  actions: PanelAction[];
}

interface AiCommitPanelProps {
  message: string;
  error: string | null;
  actionGroups: PanelActionGroup[];
  onMessageChange: (message: string) => void;
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

export function AiCommitPanel({ message, error, actionGroups, onMessageChange }: AiCommitPanelProps) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: C.appBg, overflow: 'hidden' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <MessageEditor message={message} error={error} onMessageChange={onMessageChange} />
        <ActionCluster actionGroups={actionGroups} />
        <div style={{ flex: 1, minHeight: 0 }} />
      </div>
    </div>
  );
}
