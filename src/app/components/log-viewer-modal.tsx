import { Copy, X } from 'lucide-react';
import { C } from '../theme';
import type { RepoLog } from '../types';

interface LogViewerModalProps {
  log: RepoLog | null;
  onClose: () => void;
}

export function LogViewerModal({ log, onClose }: LogViewerModalProps) {
  if (!log) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(log.content).catch(() => {});
  };

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 80, backdropFilter: 'blur(2px)' }}
      />
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 780,
          maxWidth: '95vw',
          maxHeight: '88vh',
          background: C.panel1,
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          zIndex: 81,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 24px 56px rgba(0,0,0,0.45)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ color: C.textPrimary, fontSize: 14, fontWeight: 600 }}>{log.repoName}</div>
            <div style={{ color: C.textWeak, fontSize: 11, fontFamily: 'JetBrains Mono, monospace', marginTop: 2 }}>{log.path}</div>
          </div>
          <button
            onClick={handleCopy}
            style={{
              background: C.panel2,
              border: `1px solid ${C.border}`,
              color: C.textSecondary,
              borderRadius: 6,
              padding: '6px 10px',
              cursor: 'pointer',
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <Copy size={12} /> 复制日志
          </button>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.textWeak, cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}>
            <X size={16} />
          </button>
        </div>
        <pre
          style={{
            margin: 0,
            padding: '16px 18px 20px',
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            color: C.textSecondary,
            fontSize: 12,
            lineHeight: 1.65,
            fontFamily: 'JetBrains Mono, monospace',
            background: C.appBg,
            flex: 1,
          }}
        >
          {log.content}
        </pre>
      </div>
    </>
  );
}
