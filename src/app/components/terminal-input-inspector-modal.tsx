import { Copy, Trash2, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { Terminal } from '@xterm/xterm';
import { C } from '../theme';
import { describeTerminalKeyboardEvent, formatTerminalInputTrace, type TerminalInputTraceEntry, type TerminalInputTraceStage } from './terminal-input-trace';
import { formatTerminalProtocolSnapshot, type TerminalProtocolSnapshot } from './terminal-protocol-observer';

interface TerminalInputInspectorModalProps {
  open: boolean;
  terminal: Terminal | null;
  entries: readonly TerminalInputTraceEntry[];
  protocol: TerminalProtocolSnapshot;
  onClear: () => void;
  onClose: () => void;
  onTrace: (stage: TerminalInputTraceStage, detail: string, data?: string) => void;
  onTerminalViewportChanged: () => void;
}

export function TerminalInputInspectorModal({
  open,
  terminal,
  entries,
  protocol,
  onClear,
  onClose,
  onTrace,
  onTerminalViewportChanged,
}: TerminalInputInspectorModalProps) {
  const inputViewportRef = useRef<HTMLDivElement | null>(null);
  const onTraceRef = useRef(onTrace);
  const onTerminalViewportChangedRef = useRef(onTerminalViewportChanged);

  onTraceRef.current = onTrace;
  onTerminalViewportChangedRef.current = onTerminalViewportChanged;

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      onTraceRef.current('浏览器事件', describeTerminalKeyboardEvent(event));
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose, open]);

  useEffect(() => {
    if (!open || !terminal || !inputViewportRef.current) return;
    const terminalElement = terminal.element;
    const originalParent = terminalElement?.parentElement;
    if (!terminalElement || !originalParent) return;

    inputViewportRef.current.appendChild(terminalElement);
    requestAnimationFrame(() => {
      onTerminalViewportChangedRef.current();
      terminal.focus();
    });

    return () => {
      originalParent.appendChild(terminalElement);
      requestAnimationFrame(() => {
        onTerminalViewportChangedRef.current();
        terminal.focus();
      });
    };
  }, [open, terminal]);

  if (!open) return null;

  const traceContent = entries.length > 0
    ? entries.map(formatTerminalInputTrace).join('\n')
    : '等待真实终端输入...';
  const content = `${formatTerminalProtocolSnapshot(protocol)}\n\n输入链路：\n${traceContent}`;

  const copyTrace = () => {
    navigator.clipboard.writeText(content).catch(error => console.error('复制终端输入观测失败', error));
  };

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 90, backdropFilter: 'blur(2px)' }}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label="终端输入观测"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 1180,
          maxWidth: '95vw',
          height: 'min(78vh, 640px)',
          background: C.panel1,
          border: `1px solid ${C.border}`,
          borderRadius: 8,
          zIndex: 91,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 24px 56px rgba(0,0,0,0.45)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ color: C.textPrimary, fontSize: 13, fontWeight: 600, flex: 1 }}>终端协议与输入观测</div>
          <button type="button" onClick={copyTrace} title="复制观测结果" aria-label="复制观测结果" style={iconButtonStyle}>
            <Copy size={15} />
          </button>
          <button type="button" onClick={onClear} title="清空观测结果" aria-label="清空观测结果" style={iconButtonStyle}>
            <Trash2 size={15} />
          </button>
          <button type="button" onClick={onClose} title="关闭" aria-label="关闭" style={iconButtonStyle}>
            <X size={16} />
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', flex: 1, minHeight: 0, background: '#0b1220' }}>
          <TerminalPane label="真实终端输入区域">
            <div ref={inputViewportRef} style={{ flex: 1, minHeight: 0, overflow: 'hidden', padding: '10px 12px' }} />
          </TerminalPane>
          <TerminalPane label="协议状态与输入观测结果" bordered>
            <pre
              style={{
                margin: 0,
                padding: '10px 12px',
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                color: '#dbe7f5',
                fontSize: 12,
                lineHeight: 1.65,
                fontFamily: 'JetBrains Mono, Consolas, monospace',
                flex: 1,
              }}
            >
              {content}
            </pre>
          </TerminalPane>
        </div>
      </section>
    </>
  );
}

function TerminalPane({ children, label, bordered = false }: { children: React.ReactNode; label: string; bordered?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, borderLeft: bordered ? `1px solid ${C.border}` : 'none' }}>
      <div style={{ flexShrink: 0, padding: '8px 12px', borderBottom: `1px solid ${C.border}`, background: C.panel2, color: C.textSecondary, fontSize: 11, fontWeight: 600 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

const iconButtonStyle = {
  width: 28,
  height: 28,
  display: 'grid',
  placeItems: 'center',
  background: C.panel2,
  border: `1px solid ${C.border}`,
  borderRadius: 4,
  color: C.textSecondary,
  cursor: 'pointer',
} as const;
