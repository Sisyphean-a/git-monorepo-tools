import { Download, Loader2, RefreshCw, Upload } from 'lucide-react';
import { C } from '../theme';

interface SidebarFooterProps {
  batchAction: 'pull' | 'push' | null;
  isRefreshing: boolean;
  recentError: string | null;
  onPullAll: () => void;
  onPushAll: () => void;
  onRefresh: () => void;
}

export function SidebarFooter({ batchAction, isRefreshing, recentError, onPullAll, onPushAll, onRefresh }: SidebarFooterProps) {
  const disabled = batchAction !== null;
  return (
    <div style={footerStyle}>
      {recentError && <div style={errorStyle}>最近错误：{recentError}</div>}
      <div style={rowStyle}>
        <button onClick={onPullAll} disabled={disabled} style={batchButtonStyle('pull', batchAction === 'pull', disabled)}>
          {batchAction === 'pull' ? <Loader2 size={12} style={spinStyle} /> : <Download size={12} />}
          {batchAction === 'pull' ? 'Pull 中…' : '全部 Pull'}
        </button>
        <button onClick={onPushAll} disabled={disabled} style={batchButtonStyle('push', batchAction === 'push', disabled)}>
          {batchAction === 'push' ? <Loader2 size={12} style={spinStyle} /> : <Upload size={12} />}
          {batchAction === 'push' ? 'Push 中…' : '全部 Push'}
        </button>
        <button onClick={onRefresh} disabled={isRefreshing} style={scanButtonStyle(isRefreshing)} aria-label="扫描全部仓库" title="扫描全部仓库">
          {isRefreshing ? <Loader2 size={12} style={spinStyle} /> : <RefreshCw size={12} />}
        </button>
      </div>
    </div>
  );
}

const footerStyle = { borderTop: `1px solid ${C.border}`, padding: '8px 12px', flexShrink: 0 };
const errorStyle = { color: C.conflict, fontSize: 10, marginBottom: 8 };
const rowStyle = { display: 'flex', gap: 6 };
const spinStyle = { animation: 'spin 1s linear infinite' };
const baseButton = { borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 };
const batchButtonStyle = (kind: 'pull' | 'push', active: boolean, disabled: boolean) => ({ ...baseButton, flex: 1, background: active || (kind === 'pull' && !disabled) ? C.btnPrimary : disabled ? C.panel3 : C.panel2, color: active || (kind === 'pull' && !disabled) ? 'white' : disabled ? C.textWeak : C.textSecondary, border: `1px solid ${active || (kind === 'pull' && !disabled) ? C.btnPrimary : C.border}`, padding: '7px 0', fontSize: 12, fontWeight: 500, opacity: disabled && !active ? 0.72 : 1, cursor: disabled ? 'not-allowed' : 'pointer' });
// Rule: 扫描按钮固定为正方形（宽高同值），与“全部 Pull/Push”同排，只占自身宽度。
const scanButtonStyle = (disabled: boolean) => ({ ...baseButton, flexShrink: 0, width: 34, height: 34, background: disabled ? C.panel3 : C.panel2, color: disabled ? C.textWeak : C.textSecondary, border: `1px solid ${C.border}`, padding: 0, opacity: disabled ? 0.78 : 1, cursor: disabled ? 'not-allowed' : 'pointer' });
