import type { ReactNode } from 'react';
import { C } from '../theme';

export function Label({ children }: { children: ReactNode }) {
  return (
    <label style={{ display: 'block', color: C.textSecondary, fontSize: 11, fontWeight: 600, marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
      {children}
    </label>
  );
}

export function Input({
  value,
  onChange,
  placeholder,
  type = 'text',
  monospace,
}: {
  value: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  type?: string;
  monospace?: boolean;
}) {
  return (
    <input
      value={value}
      onChange={e => onChange?.(e.target.value)}
      placeholder={placeholder}
      type={type}
      style={{
        width: '100%',
        background: C.panel1,
        border: `1px solid ${C.border}`,
        borderRadius: 6,
        padding: '8px 10px',
        color: value ? C.textPrimary : C.textWeak,
        fontSize: 12,
        outline: 'none',
        boxSizing: 'border-box',
        fontFamily: monospace ? 'JetBrains Mono, monospace' : 'Inter, sans-serif',
      }}
      onFocus={e => {
        e.target.style.borderColor = C.btnPrimary;
      }}
      onBlur={e => {
        e.target.style.borderColor = C.border;
      }}
    />
  );
}

export function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        width: '100%',
        background: C.panel1,
        border: `1px solid ${C.border}`,
        borderRadius: 6,
        padding: '8px 10px',
        color: C.textPrimary,
        fontSize: 12,
        outline: 'none',
        fontFamily: 'Inter, sans-serif',
        cursor: 'pointer',
      }}
    >
      {options.map(option => (
        <option key={option.value} value={option.value} style={{ background: C.panel1 }}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <div
      onClick={onChange}
      style={{
        width: 36,
        height: 20,
        borderRadius: 10,
        background: checked ? C.btnPrimary : C.panel3,
        border: `1px solid ${checked ? C.btnPrimary : C.border}`,
        cursor: 'pointer',
        position: 'relative',
        transition: 'all 0.15s',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 3,
          left: checked ? 17 : 3,
          width: 12,
          height: 12,
          borderRadius: '50%',
          background: 'white',
          transition: 'left 0.15s',
        }}
      />
    </div>
  );
}

export function FormRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
