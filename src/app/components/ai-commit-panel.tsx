import { useEffect, useState } from 'react';
import { Sparkles, Wand2 } from 'lucide-react';
import { C } from '../theme';
import type { CommitCandidate } from '../types';

interface AiCommitPanelProps {
  stagedCount: number;
  candidates: CommitCandidate[];
  loading: boolean;
  message: string;
  error: string | null;
  onGenerate: () => void;
  onMessageChange: (message: string) => void;
}

function CommitCard({
  candidate,
  active,
  onPick,
}: {
  candidate: CommitCandidate;
  active: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      style={{
        width: '100%',
        background: active ? C.selectedBg : C.panel2,
        border: `1px solid ${active ? C.btnPrimary : C.border}`,
        borderRadius: 10,
        padding: '12px 14px',
        textAlign: 'left',
        cursor: 'pointer',
        transition: 'all 0.15s',
      }}
    >
      <div style={{ color: C.textPrimary, fontSize: 12, lineHeight: 1.7, fontFamily: 'JetBrains Mono, monospace', whiteSpace: 'pre-wrap' }}>
        {candidate.full}
      </div>
    </button>
  );
}

export function AiCommitPanel({
  stagedCount,
  candidates,
  loading,
  message,
  error,
  onGenerate,
  onMessageChange,
}: AiCommitPanelProps) {
  const [hasGenerated, setHasGenerated] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    setHasGenerated(false);
    setActiveId(null);
  }, [stagedCount]);

  useEffect(() => {
    if (candidates.length > 0) setHasGenerated(true);
    if (activeId && !candidates.some(candidate => candidate.id === activeId)) setActiveId(null);
  }, [candidates]);

  const handleGenerate = () => {
    if (stagedCount === 0 || loading) return;
    setHasGenerated(true);
    setActiveId(null);
    onGenerate();
  };

  const handlePick = (candidate: CommitCandidate) => {
    setActiveId(candidate.id);
    onMessageChange(candidate.full);
  };

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
            onClick={handleGenerate}
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
        {candidates.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {candidates.map(candidate => (
              <CommitCard
                key={candidate.id}
                candidate={candidate}
                active={activeId === candidate.id}
                onPick={() => handlePick(candidate)}
              />
            ))}
          </div>
        )}

        {hasGenerated && !loading && candidates.length === 0 && (
          <div
            style={{
              marginBottom: 16,
              padding: '14px 16px',
              background: C.panel2,
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              color: C.textSecondary,
              fontSize: 12,
              lineHeight: 1.6,
            }}
          >
            当前没有可显示的候选。
          </div>
        )}

        <div style={{ marginBottom: 10 }}>
          <div style={{ color: C.textSecondary, fontSize: 11, fontWeight: 600, marginBottom: 6 }}>
            提交信息
            {message && <span style={{ color: C.textWeak, fontWeight: 400, marginLeft: 6 }}>(已编辑)</span>}
          </div>
          <textarea
            value={message}
            onChange={e => onMessageChange(e.target.value)}
            placeholder="输入提交信息，或从上方候选中选择…"
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

        {!hasGenerated && (
          <div
            style={{
              textAlign: 'center',
              padding: '24px 20px',
              color: C.textWeak,
              fontSize: 12,
              background: C.panel2,
              borderRadius: 10,
              border: `1px dashed ${C.border}`,
            }}
          >
            <Sparkles size={24} color={C.aiAccent} style={{ opacity: 0.4, marginBottom: 8 }} />
            <div style={{ color: C.textSecondary }}>暂存文件后生成候选</div>
          </div>
        )}
      </div>
    </div>
  );
}
