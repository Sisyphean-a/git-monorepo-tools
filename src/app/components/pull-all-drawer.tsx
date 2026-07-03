import { X, CheckCircle2, SkipForward, XCircle, Minus, FolderOpen, ScrollText, RefreshCw } from 'lucide-react';
import { C } from '../theme';
import { sortPullResults } from '../pull-results';
import type { PullResult } from '../types';

interface PullAllDrawerProps {
  open: boolean;
  operation: 'pullAll' | 'pushAll';
  results: PullResult[];
  scannedAt: string;
  onClose: () => void;
  onOpenRepo: (path: string) => void;
  onViewLog: (repoId: string) => void;
  onRetry: (repoId: string, operation: 'pullAll' | 'pushAll') => void;
}

function ResultIcon({ result }: { result: PullResult['result'] }) {
  if (result === 'pulled') return <CheckCircle2 size={14} color={C.added} />;
  if (result === 'pushed') return <CheckCircle2 size={14} color={C.added} />;
  if (result === 'skipped') return <SkipForward size={14} color={C.textWeak} />;
  if (result === 'failed') return <XCircle size={14} color={C.conflict} />;
  return <Minus size={14} color={C.clean} />;
}

function ResultBadge({ result }: { result: PullResult['result'] }) {
  const cfg = {
    pulled: { label: '已拉取', color: C.added, bg: `${C.added}18` },
    pushed: { label: '已推送', color: C.added, bg: `${C.added}18` },
    skipped: { label: '已跳过', color: C.textWeak, bg: `${C.textWeak}18` },
    failed: { label: '失败', color: C.conflict, bg: `${C.conflict}18` },
    uptodate: { label: '已同步', color: C.clean, bg: `${C.clean}18` },
  }[result];

  return (
    <span
      style={{
        color: cfg.color,
        background: cfg.bg,
        fontSize: 10,
        fontWeight: 600,
        padding: '2px 7px',
        borderRadius: 4,
        flexShrink: 0,
      }}
    >
      {cfg.label}
    </span>
  );
}

export function PullAllDrawer({ open, operation, results, scannedAt, onClose, onOpenRepo, onViewLog, onRetry }: PullAllDrawerProps) {
  const successLabel = operation === 'pullAll' ? '已拉取' : '已推送';
  const successResult = operation === 'pullAll' ? 'pulled' : 'pushed';
  const title = operation === 'pullAll' ? '批量 Pull 结果' : '批量 Push 结果';
  const success = results.filter(result => result.result === successResult).length;
  const skipped = results.filter(result => result.result === 'skipped').length;
  const failed = results.filter(result => result.result === 'failed').length;
  const uptodate = results.filter(result => result.result === 'uptodate').length;
  const sortedResults = sortPullResults(results);

  return (
    <>
      {open && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 40,
            backdropFilter: 'blur(2px)',
          }}
        />
      )}

      <div
        style={{
          position: 'fixed',
          right: 0,
          top: 0,
          bottom: 0,
          width: 520,
          background: C.panel1,
          borderLeft: `1px solid ${C.border}`,
          zIndex: 50,
          display: 'flex',
          flexDirection: 'column',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          boxShadow: '-20px 0 60px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', padding: '16px 18px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          <div>
            <h3 style={{ color: C.textPrimary, fontSize: 15, fontWeight: 600, margin: 0, marginBottom: 2 }}>
              {title}
            </h3>
            <div style={{ color: C.textWeak, fontSize: 11 }}>
              共扫描 {results.length} 个仓库 · {success} 个{successLabel} · {skipped} 个已跳过 · {failed} 个失败 · {uptodate} 个已同步
            </div>
          </div>
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: C.textWeak, cursor: 'pointer', padding: 4, borderRadius: 4, display: 'flex', alignItems: 'center' }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          {[
            { label: successLabel, count: success, color: C.added },
            { label: '已同步', count: uptodate, color: C.clean },
            { label: '已跳过', count: skipped, color: C.textWeak },
            { label: '失败', count: failed, color: C.conflict },
          ].map((stat, index) => (
            <div
              key={stat.label}
              style={{
                flex: 1,
                padding: '10px 14px',
                borderRight: index < 3 ? `1px solid ${C.border}` : 'none',
                textAlign: 'center',
              }}
            >
              <div style={{ color: stat.color, fontSize: 20, fontWeight: 600, fontFamily: 'JetBrains Mono, monospace' }}>{stat.count}</div>
              <div style={{ color: C.textWeak, fontSize: 10 }}>{stat.label}</div>
            </div>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {sortedResults.map(result => (
            <div
              key={result.id}
              style={{
                padding: '10px 18px',
                borderLeft: `3px solid ${
                  result.result === 'pulled' || result.result === 'pushed' ? C.added :
                  result.result === 'failed' ? C.conflict :
                  result.result === 'uptodate' ? C.clean : 'transparent'
                }`,
                borderBottom: `1px solid ${C.border}30`,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <ResultIcon result={result.result} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: C.textPrimary, fontSize: 13, fontWeight: 500 }}>{result.name}</span>
                  <ResultBadge result={result.result} />
                  {result.commits && <span style={{ color: C.added, fontSize: 11 }}>+{result.commits} 个提交</span>}
                </div>
                <div style={{ color: C.textWeak, fontSize: 11, fontFamily: 'JetBrains Mono, monospace', marginTop: 2 }}>
                  {result.detail}
                </div>
                <div style={{ color: C.clean, fontSize: 10, fontFamily: 'JetBrains Mono, monospace', marginTop: 1 }}>
                  {result.path}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <button onClick={() => onOpenRepo(result.path)} style={{ background: 'none', border: `1px solid ${C.border}`, color: C.textWeak, borderRadius: 5, padding: '4px 8px', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 3 }}>
                  <FolderOpen size={11} /> 打开
                </button>
                {result.result === 'failed' && (
                  <button onClick={() => onRetry(result.id, operation)} style={{ background: `${C.conflict}15`, border: `1px solid ${C.conflict}40`, color: C.conflict, borderRadius: 5, padding: '4px 8px', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 3 }}>
                    <RefreshCw size={11} /> 重试
                  </button>
                )}
                <button onClick={() => onViewLog(result.id)} style={{ background: 'none', border: `1px solid ${C.border}`, color: C.textWeak, borderRadius: 5, padding: '4px 8px', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 3 }}>
                  <ScrollText size={11} /> 日志
                </button>
              </div>
            </div>
          ))}
        </div>

        <div style={{ padding: '12px 18px', borderTop: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <span style={{ color: C.textWeak, fontSize: 11 }}>完成于 {scannedAt.split(' ').at(-1) ?? scannedAt}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => {
                const report = sortedResults.map(result => `${result.name} [${result.result}] ${result.detail}`).join('\n');
                navigator.clipboard.writeText(report).catch(() => {});
              }}
              style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.textSecondary, borderRadius: 6, padding: '7px 16px', cursor: 'pointer', fontSize: 12 }}
            >
              复制报告
            </button>
            <button onClick={onClose} style={{ background: C.btnPrimary, color: 'white', border: 'none', borderRadius: 6, padding: '7px 16px', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>
              完成
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
