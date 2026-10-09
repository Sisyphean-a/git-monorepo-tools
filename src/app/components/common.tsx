import type { CSSProperties, ReactNode } from 'react';
import { C } from '../theme';

export const INSPECTOR_BACKDROP_STYLE: CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.68)', zIndex: 90, backdropFilter: 'blur(3px)',
};

export const INSPECTOR_DIALOG_STYLE: CSSProperties = {
  position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
  width: '94vw', height: '92vh', background: C.panel1, border: `1px solid ${C.border}`,
  borderRadius: 12, zIndex: 91, display: 'flex', flexDirection: 'column', overflow: 'hidden',
  boxShadow: '0 25px 70px rgba(0,0,0,0.55)',
};

export function AppFrame({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        height: '100vh',
        // Rule: 原生标题栏与内容区同为 panel1，用一条分隔线区分标题栏和内容区。
        borderTop: `1px solid ${C.border}`,
        display: 'flex',
        flexDirection: 'column',
        background: C.appBg,
        color: C.textPrimary,
        fontFamily: 'Inter, system-ui, sans-serif',
        overflow: 'hidden',
        fontSize: 14,
      }}
    >
      {children}
    </div>
  );
}

export function IconButton({
  icon,
  title,
  onClick,
  active = false,
}: {
  icon: ReactNode;
  title: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        background: active ? C.selectedBg : 'none',
        border: `1px solid ${active ? C.borderLight : 'transparent'}`,
        color: active ? C.textPrimary : C.textWeak,
        borderRadius: 6,
        padding: '5px 7px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {icon}
    </button>
  );
}

export function StatusPill({
  children,
  color,
}: {
  children: ReactNode;
  color: string;
}) {
  return (
    <span
      style={{
        color,
        backgroundColor: `${color}18`,
        fontSize: 11,
        padding: '1px 5px',
        borderRadius: 4,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 2,
        fontFamily: 'JetBrains Mono, monospace',
        lineHeight: '16px',
      }}
    >
      {children}
    </span>
  );
}
