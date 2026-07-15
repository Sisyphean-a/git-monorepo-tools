import type { ReactNode } from 'react';
import { C } from '../theme';

export function AppFrame({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        height: '100vh',
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
