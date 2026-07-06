import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Clock3, Copy, GitBranch, GitCommit, GitMerge, TerminalSquare } from 'lucide-react';
import { fetchCommitDetail, fetchRepoHistory } from '../api';
import { C } from '../theme';
import type { AppSettings, CommitDetail, CommitSummary, RepoDetail } from '../types';

const HISTORY_PAGE_SIZE = 50;

interface RepoHistoryTabProps {
  repo: RepoDetail;
  settings: AppSettings;
  onOpenTerminal: () => void;
  onSendToTerminal?: (command: string) => Promise<void>;
}

export function RepoHistoryTab({ repo, settings, onOpenTerminal, onSendToTerminal }: RepoHistoryTabProps) {
  const [commits, setCommits] = useState<CommitSummary[]>(repo.history);
  const [total, setTotal] = useState(repo.historyTotal);
  const [hasMore, setHasMore] = useState(repo.historyHasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedHash, setSelectedHash] = useState<string>(repo.history[0]?.hash ?? '');
  const [detail, setDetail] = useState<CommitDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [copiedHash, setCopiedHash] = useState('');
  const [terminalBusy, setTerminalBusy] = useState(false);

  useEffect(() => {
    setCommits(repo.history);
    setTotal(repo.historyTotal);
    setHasMore(repo.historyHasMore);
    setSelectedHash(current => {
      if (current && repo.history.some(commit => commit.hash === current)) {
        return current;
      }
      return repo.history[0]?.hash ?? '';
    });
  }, [repo.history, repo.historyHasMore, repo.historyTotal, repo.id]);

  useEffect(() => {
    if (!selectedHash) {
      setDetail(null);
      setDetailError(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);
    void fetchCommitDetail(repo.id, selectedHash, settings)
      .then(next => {
        if (cancelled) return;
        setDetail(next);
      })
      .catch(error => {
        if (cancelled) return;
        setDetail(null);
        setDetailError(error instanceof Error ? error.message : '提交详情加载失败');
      })
      .finally(() => {
        if (cancelled) return;
        setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [repo.id, selectedHash, settings]);

  const selectedSummary = useMemo(
    () => commits.find(commit => commit.hash === selectedHash) ?? null,
    [commits, selectedHash],
  );
  const detailRefs = detail?.refs ?? [];
  const detailFilesChanged = detail?.filesChanged ?? [];
  const historyLabel = total > 0 ? `最近提交 ${commits.length}/${total}` : `最近提交 ${commits.length}${hasMore ? '+' : ''}`;

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const next = await fetchRepoHistory(repo.id, commits.length, HISTORY_PAGE_SIZE, settings);
      setCommits(current => {
        const seen = new Set(current.map(commit => commit.hash));
        const merged = [...current];
        for (const commit of next.commits) {
          if (seen.has(commit.hash)) continue;
          merged.push(commit);
        }
        return merged;
      });
      setTotal(next.total);
      setHasMore(next.hasMore);
      if (!selectedHash && next.commits[0]) {
        setSelectedHash(next.commits[0].hash);
      }
    } finally {
      setLoadingMore(false);
    }
  };

  const copyHash = async (hash: string) => {
    try {
      await navigator.clipboard.writeText(hash);
      setCopiedHash(hash);
      window.setTimeout(() => {
        setCopiedHash(current => current === hash ? '' : current);
      }, 1200);
    } catch {}
  };

  const sendToTerminal = async () => {
    if (!detail || !onSendToTerminal || terminalBusy) return;
    setTerminalBusy(true);
    try {
      onOpenTerminal();
      await onSendToTerminal(`git show --stat --decorate ${detail.hash}`);
    } finally {
      setTerminalBusy(false);
    }
  };

  if (commits.length === 0) {
    return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textWeak, fontSize: 12 }}>暂无提交历史</div>;
  }

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0, background: C.appBg }}>
      <div style={{ flex: 1, minWidth: 0, borderRight: `1px solid ${C.border}`, overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: `1px solid ${C.border}`, background: C.panel1, position: 'sticky', top: 0, zIndex: 1 }}>
          <div style={{ color: C.textSecondary, fontSize: 11 }}>{historyLabel}</div>
          {hasMore && (
            <button
              onClick={() => void loadMore()}
              disabled={loadingMore}
              style={{ background: 'none', border: `1px solid ${C.border}`, color: loadingMore ? C.textWeak : C.textSecondary, borderRadius: 6, padding: '4px 10px', cursor: loadingMore ? 'default' : 'pointer', fontSize: 11 }}
            >
              {loadingMore ? '加载中…' : '加载更多'}
            </button>
          )}
        </div>
        {commits.map((commit, index) => (
          <button
            key={commit.hash}
            onClick={() => setSelectedHash(commit.hash)}
            style={{
              width: '100%',
              textAlign: 'left',
              background: commit.hash === selectedHash ? `${C.btnPrimary}12` : 'transparent',
              border: 'none',
              borderBottom: `1px solid ${C.border}30`,
              padding: '10px 14px 10px 12px',
              cursor: 'pointer',
              display: 'grid',
              gridTemplateColumns: '16px 1fr auto',
              gap: 10,
              alignItems: 'start',
            }}
          >
            <div style={{ position: 'relative', width: 16, minHeight: 42 }}>
              <div style={{ position: 'absolute', left: 7, top: index === 0 ? 12 : -10, bottom: index === commits.length - 1 ? 20 : -10, width: 1, background: `${C.border}aa` }} />
              <div style={{ position: 'absolute', left: 3, top: 12, width: 9, height: 9, borderRadius: commit.parents > 1 ? 2 : 999, background: commit.hash === selectedHash ? C.btnPrimary : C.panel3, border: `1px solid ${commit.parents > 1 ? C.modified : C.border}` }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <span style={{ color: C.textPrimary, fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{commit.message}</span>
                {commit.parents > 1 && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: C.modified, fontSize: 10 }}>
                    <GitMerge size={10} /> merge
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <span style={{ color: C.textWeak, fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}>{commit.shortHash}</span>
                <span style={{ color: C.textWeak, fontSize: 10 }}>{commit.author}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: C.textWeak, fontSize: 10 }}><Clock3 size={9} /> {commit.time}</span>
                <span style={{ color: C.textWeak, fontSize: 10 }}>{commit.files} 文件</span>
                {(commit.refs ?? []).map(ref => (
                  <span key={`${commit.hash}-${ref}`} style={{ background: `${C.aiAccent}18`, border: `1px solid ${C.aiAccent}35`, color: C.aiAccent, borderRadius: 999, padding: '1px 7px', fontSize: 10 }}>
                    {ref}
                  </span>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, minWidth: 70 }}>
              <span style={{ color: C.added, fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}>+{commit.additions}</span>
              <span style={{ color: C.deleted, fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}>-{commit.deletions}</span>
            </div>
          </button>
        ))}
      </div>

      <div style={{ width: 360, flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ padding: '12px 14px', borderBottom: `1px solid ${C.border}`, background: C.panel1 }}>
          <div style={{ color: C.textWeak, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6 }}>提交详情</div>
          <div style={{ color: C.textPrimary, fontSize: 13, fontWeight: 600, marginTop: 6, lineHeight: 1.4 }}>
            {selectedSummary?.message ?? '未选择提交'}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            <button
              onClick={() => selectedSummary && void copyHash(selectedSummary.hash)}
              disabled={!selectedSummary}
              style={detailActionBtn(Boolean(selectedSummary))}
            >
              <Copy size={11} /> {copiedHash === selectedSummary?.hash ? '已复制' : '复制 hash'}
            </button>
            <button
              onClick={() => void sendToTerminal()}
              disabled={!detail || !onSendToTerminal || terminalBusy}
              style={detailActionBtn(Boolean(detail && onSendToTerminal), true)}
            >
              <TerminalSquare size={11} /> {terminalBusy ? '发送中…' : '在终端查看'}
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
          {detailLoading && <div style={{ color: C.textWeak, fontSize: 12 }}>正在加载提交详情…</div>}
          {!detailLoading && detailError && <div style={{ color: C.conflict, fontSize: 12 }}>{detailError}</div>}
          {!detailLoading && !detailError && detail && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <div style={metaLabelStyle}>提交</div>
                <div style={{ color: C.textPrimary, fontSize: 12, fontFamily: 'JetBrains Mono, monospace', marginTop: 4 }}>{detail.hash}</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <MetaBlock label="作者" value={detail.author} subValue={detail.authorEmail} />
                <MetaBlock label="时间" value={detail.committedAt} subValue={detail.time} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                <StatPill icon={<GitCommit size={11} />} label="文件" value={String(detail.files)} />
                <StatPill icon={<GitBranch size={11} />} label="引用" value={String(detailRefs.length)} />
                <StatPill icon={<GitMerge size={11} />} label="父提交" value={String(detail.parents)} />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <StatDelta color={C.added} label="新增" value={`+${detail.additions}`} />
                <StatDelta color={C.deleted} label="删除" value={`-${detail.deletions}`} />
              </div>
              {detail.body && (
                <div>
                  <div style={metaLabelStyle}>说明</div>
                  <pre style={{ margin: '6px 0 0', padding: 0, color: C.textSecondary, fontSize: 11, lineHeight: 1.6, fontFamily: 'inherit', whiteSpace: 'pre-wrap' }}>{detail.body}</pre>
                </div>
              )}
              <div>
                <div style={metaLabelStyle}>改动文件</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                  {detailFilesChanged.map(file => (
                    <div key={file} style={{ color: C.textSecondary, fontSize: 11, fontFamily: 'JetBrains Mono, monospace', background: C.panel1, border: `1px solid ${C.border}55`, borderRadius: 6, padding: '6px 8px' }}>
                      {file}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MetaBlock({ label, value, subValue }: { label: string; value: string; subValue?: string }) {
  return (
    <div>
      <div style={metaLabelStyle}>{label}</div>
      <div style={{ color: C.textPrimary, fontSize: 12, marginTop: 4 }}>{value}</div>
      {subValue && <div style={{ color: C.textWeak, fontSize: 10, marginTop: 3 }}>{subValue}</div>}
    </div>
  );
}

function StatPill({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div style={{ background: C.panel1, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: C.textWeak, fontSize: 10 }}>
        {icon} {label}
      </div>
      <div style={{ color: C.textPrimary, fontSize: 13, fontWeight: 600, marginTop: 6 }}>{value}</div>
    </div>
  );
}

function StatDelta({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div style={{ flex: 1, borderRadius: 8, padding: '8px 10px', background: `${color}14`, border: `1px solid ${color}30` }}>
      <div style={{ color, fontSize: 10 }}>{label}</div>
      <div style={{ color, fontSize: 13, fontWeight: 600, marginTop: 4, fontFamily: 'JetBrains Mono, monospace' }}>{value}</div>
    </div>
  );
}

const metaLabelStyle = {
  color: C.textWeak,
  fontSize: 10,
  textTransform: 'uppercase' as const,
  letterSpacing: 0.5,
};

function detailActionBtn(enabled: boolean, accent = false) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    borderRadius: 6,
    border: `1px solid ${accent ? `${C.aiAccent}55` : C.border}`,
    background: accent ? `${C.aiAccent}18` : C.panel2,
    color: enabled ? (accent ? C.aiAccent : C.textSecondary) : C.textWeak,
    padding: '5px 10px',
    cursor: enabled ? 'pointer' : 'default',
    fontSize: 11,
  };
}
