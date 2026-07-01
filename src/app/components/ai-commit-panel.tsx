import { useEffect, useState } from 'react';
import { Check, Copy, ChevronRight, Eye, RefreshCw, Sparkles, Wand2 } from 'lucide-react';
import { C } from '../theme';
import type { CommitCandidate } from '../types';

interface AiCommitPanelProps {
  stagedCount: number;
  stagedPaths: string[];
  candidates: CommitCandidate[];
  message: string;
  onMessageChange: (message: string) => void;
}

function CommitCard({
  candidate,
  selected,
  copied,
  onSelect,
  onCopy,
  onUse,
  onRegenerate,
}: {
  candidate: CommitCandidate;
  selected: boolean;
  copied: boolean;
  onSelect: () => void;
  onCopy: () => void;
  onUse: () => void;
  onRegenerate: () => void;
}) {
  return (
    <div
      style={{
        background: selected ? `${C.aiAccent}10` : C.panel2,
        border: `1px solid ${selected ? C.aiAccent : C.border}`,
        borderRadius: 10,
        overflow: 'hidden',
        transition: 'all 0.15s',
      }}
    >
      <div onClick={onSelect} style={{ padding: '12px 14px', cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <span style={{ fontSize: 14 }}>{candidate.icon}</span>
          <span
            style={{
              color: C.textWeak,
              fontSize: 10,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              background: C.panel1,
              border: `1px solid ${C.border}`,
              borderRadius: 3,
              padding: '1px 5px',
            }}
          >
            {candidate.style}
          </span>
          <ChevronRight
            size={12}
            color={C.textWeak}
            style={{ marginLeft: 'auto', transform: selected ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}
          />
        </div>
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: C.textPrimary, lineHeight: 1.5, marginBottom: 4 }}>
          {candidate.title}
        </div>
        <div style={{ fontSize: 11, color: C.textWeak }}>{candidate.body}</div>
      </div>

      {selected && (
        <div style={{ borderTop: `1px solid ${C.border}40` }}>
          <div
            style={{
              padding: '8px 14px 10px',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 11,
              color: C.textSecondary,
              whiteSpace: 'pre-wrap',
              lineHeight: 1.7,
              background: C.panel1,
            }}
          >
            {candidate.full}
          </div>
          <div style={{ display: 'flex', gap: 6, padding: '8px 12px', borderTop: `1px solid ${C.border}30` }}>
            <button
              onClick={onUse}
              style={{
                background: C.btnPrimary,
                color: 'white',
                border: 'none',
                borderRadius: 5,
                padding: '5px 14px',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              使用
            </button>
            <button
              onClick={onCopy}
              style={{
                background: C.panel2,
                color: copied ? C.added : C.textSecondary,
                border: `1px solid ${C.border}`,
                borderRadius: 5,
                padding: '5px 10px',
                cursor: 'pointer',
                fontSize: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              {copied ? <Check size={11} /> : <Copy size={11} />}
              {copied ? '已复制' : '复制'}
            </button>
            <button
              onClick={onRegenerate}
              style={{
                background: 'none',
                color: C.textWeak,
                border: `1px solid ${C.border}`,
                borderRadius: 5,
                padding: '5px 10px',
                cursor: 'pointer',
                fontSize: 11,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <RefreshCw size={10} /> 重新生成此风格
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function renderPromptFiles(stagedPaths: string[]) {
  if (stagedPaths.length === 0) return '当前没有暂存文件';
  const preview = stagedPaths.slice(0, 4).join(', ');
  return stagedPaths.length > 4 ? `${preview} …` : preview;
}

export function AiCommitPanel({
  stagedCount,
  stagedPaths,
  candidates,
  message,
  onMessageChange,
}: AiCommitPanelProps) {
  const [generated, setGenerated] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    setGenerated(false);
    setSelectedId(null);
    setCopiedId(null);
  }, [stagedCount, candidates]);

  const handleGenerate = () => {
    if (stagedCount === 0) return;
    setGenerated(true);
    setSelectedId(candidates[0]?.id ?? null);
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleUse = (text: string) => {
    onMessageChange(text);
    setSelectedId(null);
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: C.appBg, overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', background: C.panel2, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
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
          <span
            style={{
              marginLeft: 'auto',
              color: C.textWeak,
              fontSize: 10,
              background: C.panel1,
              border: `1px solid ${C.border}`,
              borderRadius: 4,
              padding: '2px 6px',
            }}
          >
            仅基于已暂存变更
          </span>
        </div>
        {stagedCount === 0 && (
          <div style={{ color: C.modified, fontSize: 11, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
            ⚠ 至少先暂存一个文件才能生成
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          <button
            onClick={handleGenerate}
            disabled={stagedCount === 0}
            style={{
              flex: 1,
              background: stagedCount === 0 ? C.panel2 : 'linear-gradient(135deg, #7C3AED, #5B21B6)',
              color: stagedCount === 0 ? C.textWeak : 'white',
              border: `1px solid ${stagedCount === 0 ? C.border : '#7C3AED'}`,
              borderRadius: 7,
              padding: '8px 0',
              cursor: stagedCount === 0 ? 'not-allowed' : 'pointer',
              fontSize: 12,
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              opacity: stagedCount === 0 ? 0.5 : 1,
            }}
          >
            <Wand2 size={13} />
            {generated ? '重新生成' : '生成'}
          </button>
          <button
            onClick={() => setShowPrompt(value => !value)}
            style={{
              background: C.panel2,
              border: `1px solid ${C.border}`,
              color: C.textSecondary,
              borderRadius: 7,
              padding: '8px 12px',
              cursor: 'pointer',
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <Eye size={12} /> 查看提示词
          </button>
        </div>

        {showPrompt && (
          <div
            style={{
              background: C.panel2,
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              padding: '10px 12px',
              marginBottom: 14,
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 11,
              color: C.textSecondary,
              maxHeight: 120,
              overflowY: 'auto',
            }}
          >
            <div style={{ color: C.textWeak, marginBottom: 4 }}>系统提示词：</div>
            你是 Git 提交信息生成器。请分析下面已暂存的 Diff，并生成简洁、符合 Conventional Commit 风格的提交信息。只关注已暂存变更，并输出 3 条不同风格的候选。
            <div style={{ color: C.textWeak, marginTop: 8, marginBottom: 4 }}>已暂存文件（{stagedCount}）：</div>
            {renderPromptFiles(stagedPaths)}
          </div>
        )}

        {generated && candidates.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {candidates.map(candidate => (
              <CommitCard
                key={candidate.id}
                candidate={candidate}
                selected={selectedId === candidate.id}
                copied={copiedId === candidate.id}
                onSelect={() => setSelectedId(candidate.id === selectedId ? null : candidate.id)}
                onCopy={() => handleCopy(candidate.id, candidate.full)}
                onUse={() => handleUse(candidate.full)}
                onRegenerate={() => {}}
              />
            ))}
          </div>
        )}

        {generated && candidates.length === 0 && (
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
            当前暂存区没有可生成的提交候选。
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

        {!generated && (
          <div
            style={{
              textAlign: 'center',
              padding: '30px 20px',
              color: C.textWeak,
              fontSize: 12,
              background: C.panel2,
              borderRadius: 10,
              border: `1px dashed ${C.border}`,
            }}
          >
            <Sparkles size={24} color={C.aiAccent} style={{ opacity: 0.4, marginBottom: 8 }} />
            <div style={{ color: C.textSecondary, marginBottom: 4 }}>AI 生成提交信息</div>
            <div>暂存文件后点击“生成”，即可创建 3 条提交信息候选</div>
          </div>
        )}
      </div>

      <style>{``}</style>
    </div>
  );
}
