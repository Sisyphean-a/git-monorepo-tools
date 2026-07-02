import { Sparkles, Wand2 } from 'lucide-react';
import { C } from '../theme';

interface AiCommitPanelProps {
  stagedCount: number;
  loading: boolean;
  message: string;
  error: string | null;
  onGenerate: () => void;
  onMessageChange: (message: string) => void;
}

export function AiCommitPanel({
  stagedCount,
  loading,
  message,
  error,
  onGenerate,
  onMessageChange,
}: AiCommitPanelProps) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: C.appBg, overflow: 'hidden' }}>
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
          <button
            onClick={onGenerate}
            disabled={stagedCount === 0 || loading}
            style={{
              marginLeft: 'auto',
              background: stagedCount === 0 || loading ? C.panel1 : `${C.aiAccent}22`,
              color: stagedCount === 0 || loading ? C.textWeak : C.aiAccent,
              border: `1px solid ${stagedCount === 0 || loading ? C.border : `${C.aiAccent}66`}`,
              borderRadius: 7,
              padding: '6px 12px',
              cursor: stagedCount === 0 || loading ? 'not-allowed' : 'pointer',
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              opacity: stagedCount === 0 || loading ? 0.6 : 1,
            }}
          >
            <Wand2 size={13} />
            {loading ? '生成中…' : '生成'}
          </button>
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

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
        {!message && (
          <div
            style={{
              marginBottom: 16,
              padding: '16px 18px',
              background: C.panel2,
              borderRadius: 10,
              border: `1px dashed ${C.border}`,
              color: C.textSecondary,
              fontSize: 12,
              lineHeight: 1.6,
            }}
          >
            点击生成后会直接写入下方输入框。
          </div>
        )}

        <div style={{ marginBottom: 10 }}>
          <div style={{ color: C.textSecondary, fontSize: 11, fontWeight: 600, marginBottom: 6 }}>
            提交信息
            {message && <span style={{ color: C.textWeak, fontWeight: 400, marginLeft: 6 }}>(可编辑)</span>}
          </div>
          <textarea
            value={message}
            onChange={e => onMessageChange(e.target.value)}
            placeholder="点击生成或直接输入提交信息…"
            style={{
              width: '100%',
              background: C.panel2,
              border: `1px solid ${C.border}`,
              borderRadius: 7,
              padding: '10px 12px',
              color: message ? C.textPrimary : C.textWeak,
              fontSize: 12,
              fontFamily: 'JetBrains Mono, monospace',
              outline: 'none',
              resize: 'vertical',
              minHeight: 80,
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
      </div>
    </div>
  );
}
