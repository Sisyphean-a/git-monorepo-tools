import { Download, Loader2, RefreshCw, Upload } from 'lucide-react';
import { formatAutoScanLabel } from '../infrastructure/settings-store';
import { C } from '../theme';
import type { AppSettings, Repo } from '../domain/types';

interface SidebarFooterProps {
  repos: Repo[];
  scannedAt: string;
  settings: AppSettings;
  batchAction: 'pull' | 'push' | null;
  isRefreshing: boolean;
  recentError: string | null;
  onPullAll: () => void;
  onPushAll: () => void;
  onRefresh: () => void;
  onToggleAutoScan: () => void;
}

export function SidebarFooter(props: SidebarFooterProps) {
  const pending = props.repos.some(repo => repo.status === 'checking');
  const scanTime = props.scannedAt.split(' ').at(-1) ?? props.scannedAt;
  return (
    <div style={footerStyle}>
      <div style={statusStyle}>{pending ? '启动扫描中…' : `上次扫描 ${scanTime}`}</div>
      {props.recentError && <div style={errorStyle}>最近错误：{props.recentError}</div>}
      <BatchControls {...props} />
      <ScanControls {...props} />
    </div>
  );
}

function BatchControls({ batchAction, onPullAll, onPushAll }: SidebarFooterProps) {
  const disabled = batchAction !== null;
  return (
    <div style={rowStyle}>
      <button onClick={onPullAll} disabled={disabled} style={batchButtonStyle('pull', batchAction === 'pull', disabled)}>
        {batchAction === 'pull' ? <Loader2 size={12} style={spinStyle} /> : <Download size={12} />}
        {batchAction === 'pull' ? 'Pull 中…' : '全部 Pull'}
      </button>
      <button onClick={onPushAll} disabled={disabled} style={batchButtonStyle('push', batchAction === 'push', disabled)}>
        {batchAction === 'push' ? <Loader2 size={12} style={spinStyle} /> : <Upload size={12} />}
        {batchAction === 'push' ? 'Push 中…' : '全部 Push'}
      </button>
    </div>
  );
}

function ScanControls({ settings, isRefreshing, onRefresh, onToggleAutoScan }: SidebarFooterProps) {
  const enabled = settings.gitBehavior.autoScanEnabled;
  return (
    <div style={controlsStyle}>
      <button onClick={onRefresh} disabled={isRefreshing} style={scanButtonStyle(isRefreshing)}>
        {isRefreshing ? <Loader2 size={11} style={spinStyle} /> : <RefreshCw size={11} />}
        {isRefreshing ? '扫描中…' : '扫描'}
      </button>
      <button onClick={onToggleAutoScan} style={toggleRowStyle} aria-pressed={enabled}>
        <span style={toggleStyle(enabled)}><span style={knobStyle(enabled)} /></span>
        <span>{formatAutoScanLabel(settings)}</span>
      </button>
    </div>
  );
}

const footerStyle = { borderTop: `1px solid ${C.border}`, padding: '10px 12px', flexShrink: 0 };
const statusStyle = { color: C.textWeak, fontSize: 10, marginBottom: 8, fontFamily: 'JetBrains Mono, monospace' };
const errorStyle = { color: C.conflict, fontSize: 10, marginBottom: 8 };
const rowStyle = { display: 'flex', gap: 6, marginBottom: 8 };
const controlsStyle = { display: 'flex', gap: 6, alignItems: 'center' };
const spinStyle = { animation: 'spin 1s linear infinite' };
const baseButton = { borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 };
const batchButtonStyle = (kind: 'pull' | 'push', active: boolean, disabled: boolean) => ({ ...baseButton, flex: 1, background: active || (kind === 'pull' && !disabled) ? C.btnPrimary : disabled ? C.panel3 : C.panel2, color: active || (kind === 'pull' && !disabled) ? 'white' : disabled ? C.textWeak : C.textSecondary, border: `1px solid ${active || (kind === 'pull' && !disabled) ? C.btnPrimary : C.border}`, padding: '7px 0', fontSize: 12, fontWeight: 500, opacity: disabled && !active ? 0.72 : 1, cursor: disabled ? 'not-allowed' : 'pointer' });
const scanButtonStyle = (disabled: boolean) => ({ ...baseButton, background: disabled ? C.panel3 : C.panel2, color: disabled ? C.textWeak : C.textSecondary, border: `1px solid ${C.border}`, padding: '5px 10px', fontSize: 11, opacity: disabled ? 0.78 : 1, cursor: disabled ? 'not-allowed' : 'pointer' });
const toggleRowStyle = { flex: 1, display: 'flex', alignItems: 'center', gap: 6, padding: 0, border: 0, background: 'transparent', color: C.textWeak, fontSize: 11, cursor: 'pointer' };
const toggleStyle = (enabled: boolean) => ({ width: 28, height: 16, borderRadius: 8, background: enabled ? C.btnPrimary : C.panel3, border: `1px solid ${enabled ? C.btnPrimary : C.border}`, position: 'relative' as const, flexShrink: 0 });
const knobStyle = (enabled: boolean) => ({ position: 'absolute' as const, top: 2, left: enabled ? 13 : 2, width: 10, height: 10, borderRadius: '50%', background: 'white', transition: 'left 0.15s' });
