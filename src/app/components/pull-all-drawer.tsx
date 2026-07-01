import { X, CheckCircle2, SkipForward, XCircle, Minus, FolderOpen, ScrollText, RefreshCw } from 'lucide-react';
import { C } from '../theme';
import { PULL_RESULTS, SCANNED_AT } from '../data';
import type { PullResult } from '../types';

interface PullAllDrawerProps {
  open: boolean;
  onClose: () => void;
}

function ResultIcon({ result }: { result: PullResult['result'] }) {
  if (result === 'pulled') return <CheckCircle2 size={14} color={C.added} />;
  if (result === 'skipped') return <SkipForward size={14} color={C.textWeak} />;
  if (result === 'failed') return <XCircle size={14} color={C.conflict} />;
  return <Minus size={14} color={C.clean} />;
}

function ResultBadge({ result }: { result: PullResult['result'] }) {
  const cfg = {
    pulled: { label: 'Pulled', color: C.added, bg: `${C.added}18` },
    skipped: { label: 'Skipped', color: C.textWeak, bg: `${C.textWeak}18` },
    failed: { label: 'Failed', color: C.conflict, bg: `${C.conflict}18` },
    uptodate: { label: 'Up to date', color: C.clean, bg: `${C.clean}18` },
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

export function PullAllDrawer({ open, onClose }: PullAllDrawerProps) {
  const pulled = PULL_RESULTS.filter(result => result.result === 'pulled').length;
  const skipped = PULL_RESULTS.filter(result => result.result === 'skipped').length;
  const failed = PULL_RESULTS.filter(result => result.result === 'failed').length;
  const uptodate = PULL_RESULTS.filter(result => result.result === 'uptodate').length;

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
              Pull All Results
            </h3>
            <div style={{ color: C.textWeak, fontSize: 11 }}>
              {PULL_RESULTS.length} repos scanned · {pulled} pulled · {skipped} skipped · {failed} failed · {uptodate} up to date
            </div>
          </div>
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: C.textWeak, cursor: 'pointer', padding: 4, borderRadius: 4, display: 'flex', alignItems: 'center' }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          {[
            { label: 'Pulled', count: pulled, color: C.added },
            { label: 'Up to date', count: uptodate, color: C.clean },
            { label: 'Skipped', count: skipped, color: C.textWeak },
            { label: 'Failed', count: failed, color: C.conflict },
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
          {PULL_RESULTS.map(result => (
            <div
              key={result.id}
              style={{
                padding: '10px 18px',
                borderLeft: `3px solid ${
                  result.result === 'pulled' ? C.added :
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
                  {result.commits && <span style={{ color: C.added, fontSize: 11 }}>+{result.commits} commits</span>}
                </div>
                <div style={{ color: C.textWeak, fontSize: 11, fontFamily: 'JetBrains Mono, monospace', marginTop: 2 }}>
                  {result.detail}
                </div>
                <div style={{ color: C.clean, fontSize: 10, fontFamily: 'JetBrains Mono, monospace', marginTop: 1 }}>
                  {result.path}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <button style={{ background: 'none', border: `1px solid ${C.border}`, color: C.textWeak, borderRadius: 5, padding: '4px 8px', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 3 }}>
                  <FolderOpen size={11} /> Open
                </button>
                {result.result === 'failed' && (
                  <button style={{ background: `${C.conflict}15`, border: `1px solid ${C.conflict}40`, color: C.conflict, borderRadius: 5, padding: '4px 8px', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 3 }}>
                    <RefreshCw size={11} /> Retry
                  </button>
                )}
                <button style={{ background: 'none', border: `1px solid ${C.border}`, color: C.textWeak, borderRadius: 5, padding: '4px 8px', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 3 }}>
                  <ScrollText size={11} /> Log
                </button>
              </div>
            </div>
          ))}
        </div>

        <div style={{ padding: '12px 18px', borderTop: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <span style={{ color: C.textWeak, fontSize: 11 }}>Completed at {SCANNED_AT.split(' ').at(-1) ?? SCANNED_AT}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.textSecondary, borderRadius: 6, padding: '7px 16px', cursor: 'pointer', fontSize: 12 }}>
              Copy Report
            </button>
            <button onClick={onClose} style={{ background: C.btnPrimary, color: 'white', border: 'none', borderRadius: 6, padding: '7px 16px', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>
              Done
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
