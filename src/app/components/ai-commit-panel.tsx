import type { ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
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
  stagedCount: number;
  message: string;
  error: string | null;
  actionGroups: PanelActionGroup[];
  onMessageChange: (message: string) => void;
}

function PanelHeader({ stagedCount, error }: Pick<AiCommitPanelProps, 'stagedCount' | 'error'>) {
  return (
    <div style={{ padding: '10px 14px', background: C.panel2, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            background: 'linear-gradient(135deg, #7C3AED, #3B82F6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Sparkles size={12} color="white" />
        </div>
        <span style={{ color: C.textPrimary, fontSize: 13, fontWeight: 600 }}>AI 提交信息</span>
      </div>
      {stagedCount === 0 && (
        <div style={{ color: C.modified, fontSize: 11, marginTop: 6 }}>
          至少先暂存一个文件才能生成
        </div>
      )}
      {error && (
        <div style={{ color: C.conflict, fontSize: 11, marginTop: 6, lineHeight: 1.5 }}>
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

function MessageEditor({ message, onMessageChange }: Pick<AiCommitPanelProps, 'message' | 'onMessageChange'>) {
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ color: C.textSecondary, fontSize: 11, fontWeight: 600, marginBottom: 6 }}>
        提交信息
        {message && <span style={{ color: C.textWeak, fontWeight: 400, marginLeft: 6 }}>(可编辑)</span>}
      </div>
      <textarea
        value={message}
        onChange={e => onMessageChange(e.target.value)}
        placeholder="输入提交信息…"
        style={{
          width: '100%',
          flex: 1,
          background: C.panel2,
          border: `1px solid ${C.border}`,
          borderRadius: 7,
          padding: '10px 12px',
          color: message ? C.textPrimary : C.textWeak,
          fontSize: 12,
          fontFamily: 'JetBrains Mono, monospace',
          outline: 'none',
          resize: 'vertical',
          minHeight: 180,
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
    </div>
  );
}

export function AiCommitPanel({ stagedCount, message, error, actionGroups, onMessageChange }: AiCommitPanelProps) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: C.appBg, overflow: 'hidden' }}>
      <PanelHeader stagedCount={stagedCount} error={error} />
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <ActionCluster actionGroups={actionGroups} />
        <MessageEditor message={message} onMessageChange={onMessageChange} />
      </div>
    </div>
  );
}
