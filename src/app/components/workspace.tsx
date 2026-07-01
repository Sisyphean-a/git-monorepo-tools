import { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  AlertTriangle,
  Clock,
  Download,
  FolderOpen,
  GitBranch,
  GitCommit,
  PlusSquare,
  MinusSquare,
  RefreshCw,
  Settings2,
  Sparkles,
  Terminal,
  Upload,
  ChevronRight,
} from 'lucide-react';
import { C } from '../theme';
import { COMMIT_CANDIDATES, REPO_DETAILS, REPOS } from '../data';
import { AiCommitPanel } from './ai-commit-panel';
import { DiffList } from './diff-list';
import type { CommitSummary, FileChange, Repo, RepoDetail } from '../types';

type MainTab = 'changes' | 'staged' | 'history' | 'activity';

interface WorkspaceProps {
  selectedRepoId: string;
  onOpenSettings: () => void;
}

function ConflictBanner({ repo }: { repo: Repo }) {
  return (
    <div
      style={{
        background: `${C.conflict}12`,
        border: `1px solid ${C.conflict}40`,
        borderRadius: 8,
        padding: '10px 14px',
        margin: '12px 14px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
      }}
    >
      <AlertTriangle size={14} color={C.conflict} style={{ marginTop: 1, flexShrink: 0 }} />
      <div>
        <div style={{ color: C.conflict, fontSize: 12, fontWeight: 600, marginBottom: 2 }}>Merge Conflict Detected</div>
        <div style={{ color: C.textSecondary, fontSize: 11, lineHeight: 1.5 }}>
          {repo.conflicts} file{repo.conflicts > 1 ? 's' : ''} have conflicts that must be resolved before you can merge.
          Pull was skipped to prevent data loss. Resolve conflicts manually, then stage and commit.
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button style={{ background: C.conflict, color: 'white', border: 'none', borderRadius: 5, padding: '4px 12px', cursor: 'pointer', fontSize: 11, fontWeight: 500 }}>
            Open Conflict Resolver
          </button>
          <button style={{ background: 'none', border: `1px solid ${C.conflict}50`, color: C.conflict, borderRadius: 5, padding: '4px 10px', cursor: 'pointer', fontSize: 11 }}>
            View Log
          </button>
        </div>
      </div>
    </div>
  );
}

function HistoryTab({ commits }: { commits: CommitSummary[] }) {
  if (commits.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textWeak, fontSize: 12 }}>
        暂无提交历史
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      {commits.map(commit => (
        <div
          key={commit.hash}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 14px',
            borderBottom: `1px solid ${C.border}30`,
            cursor: 'pointer',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLDivElement).style.background = C.hoverBg;
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLDivElement).style.background = 'transparent';
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background: C.panel2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <GitCommit size={12} color={C.textWeak} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: C.textPrimary, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {commit.message}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 2, alignItems: 'center' }}>
              <span style={{ color: C.textWeak, fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}>{commit.shortHash}</span>
              <span style={{ color: C.textWeak, fontSize: 10 }}>·</span>
              <span style={{ color: C.textWeak, fontSize: 10 }}>{commit.author}</span>
              <span style={{ color: C.textWeak, fontSize: 10 }}>·</span>
              <Clock size={9} color={C.textWeak} />
              <span style={{ color: C.textWeak, fontSize: 10 }}>{commit.time}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <span style={{ color: C.added, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}>+{commit.additions}</span>
            <span style={{ color: C.deleted, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}>-{commit.deletions}</span>
          </div>
          <ChevronRight size={12} color={C.textWeak} />
        </div>
      ))}
    </div>
  );
}

function ToolbarBtn({
  label,
  icon,
  onClick,
  disabled,
  primary,
  accent,
  warning,
  dimmed,
}: {
  label: string;
  icon: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  primary?: boolean;
  accent?: boolean;
  warning?: boolean;
  dimmed?: boolean;
}) {
  const bg = primary ? C.btnPrimary : accent ? `${C.aiAccent}22` : 'transparent';
  const borderColor = primary ? C.btnPrimary : accent ? `${C.aiAccent}60` : warning ? `${C.modified}60` : C.border;
  const textColor = primary ? 'white' : accent ? C.aiAccent : warning ? C.modified : dimmed ? C.textWeak : C.textSecondary;

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: bg,
        border: `1px solid ${disabled ? C.border : borderColor}`,
        color: disabled ? C.textWeak : textColor,
        borderRadius: 6,
        padding: '5px 10px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 12,
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        opacity: disabled ? 0.45 : dimmed ? 0.6 : 1,
        transition: 'all 0.1s',
        fontWeight: primary ? 500 : 400,
      }}
    >
      {icon} {label}
    </button>
  );
}

function summarizeFiles(files: FileChange[]) {
  const uniqueByPath = new Map<string, FileChange['status']>();
  for (const file of files) {
    if (!uniqueByPath.has(file.path)) uniqueByPath.set(file.path, file.status);
  }
  const statuses = [...uniqueByPath.values()];
  return {
    total: uniqueByPath.size,
    added: statuses.filter(status => status === 'A').length,
    modified: statuses.filter(status => status === 'M' || status === 'R').length,
    deleted: statuses.filter(status => status === 'D').length,
  };
}

export function Workspace({ selectedRepoId, onOpenSettings }: WorkspaceProps) {
  const fallbackRepo = REPOS[0];
  const repo = (REPO_DETAILS[selectedRepoId] ?? (fallbackRepo ? REPO_DETAILS[fallbackRepo.id] : undefined)) as RepoDetail | undefined;
  const [mainTab, setMainTab] = useState<MainTab>('changes');
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [commitMessage, setCommitMessage] = useState('');
  const [stagedIds, setStagedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const nextFiles = repo?.files ?? [];
    setSelectedFileId(nextFiles[0]?.id ?? null);
    setStagedIds(new Set(nextFiles.filter(file => file.staged).map(file => file.id)));
    setCommitMessage('');
  }, [repo?.id, repo?.scannedAt]);

  if (!repo) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textWeak, fontSize: 12 }}>
        未发现可展示的仓库
      </div>
    );
  }

  const files = repo.files;
  const fileSummary = summarizeFiles(files);
  const stagedFiles = files.filter(file => stagedIds.has(file.id));
  const commitCandidates = COMMIT_CANDIDATES[repo.id] ?? [];

  const handleToggleStaged = (id: string) => {
    setStagedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleStageAll = () => setStagedIds(new Set(files.map(file => file.id)));
  const handleUnstageAll = () => setStagedIds(new Set());

  const totalAdded = fileSummary.added;
  const totalModified = fileSummary.modified;
  const totalDeleted = fileSummary.deleted;
  const isConflict = repo.conflicts > 0;
  const hasStaged = stagedIds.size > 0;
  const hasCommitMsg = commitMessage.trim().length > 0;
  const hasPull = repo.behind > 0;
  const hasPush = repo.ahead > 0;

  const mainTabs: { key: MainTab; label: string }[] = [
    { key: 'changes', label: `Changes ${fileSummary.total > 0 ? `(${fileSummary.total})` : ''}` },
    { key: 'staged', label: `Staged (${stagedIds.size})` },
    { key: 'history', label: 'History' },
    { key: 'activity', label: 'Activity' },
  ];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: C.appBg }}>
      <div style={{ background: C.panel1, borderBottom: `1px solid ${C.border}`, padding: '10px 16px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ color: C.textPrimary, fontSize: 15, fontWeight: 600 }}>{repo.name}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 5, padding: '2px 8px' }}>
                <GitBranch size={11} color={C.btnPrimary} />
                <span style={{ color: C.btnPrimary, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}>{repo.branch}</span>
              </div>
              <span style={{ color: C.textWeak, fontSize: 10 }}>→</span>
              <span style={{ color: C.textWeak, fontSize: 11 }}>{repo.remote}</span>
              {repo.ahead > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 3, color: C.needPush, fontSize: 11 }}>
                  <ArrowUp size={11} /> {repo.ahead} to push
                </div>
              )}
              {repo.behind > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 3, color: C.needPull, fontSize: 11 }}>
                  <ArrowDown size={11} /> {repo.behind} to pull
                </div>
              )}
              {isConflict && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 3, color: C.conflict, fontSize: 11 }}>
                  <AlertTriangle size={11} /> {repo.conflicts} conflicts
                </div>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <span style={{ color: C.textWeak, fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}>{repo.path}</span>
              {fileSummary.total > 0 && (
                <>
                  <span style={{ color: C.textWeak, fontSize: 10 }}>·</span>
                  <span style={{ color: C.textSecondary, fontSize: 10 }}>
                    {fileSummary.total} changes ·
                    <span style={{ color: C.added }}> +{totalAdded} added</span> ·
                    <span style={{ color: C.modified }}> ~{totalModified} modified</span> ·
                    <span style={{ color: C.deleted }}> -{totalDeleted} deleted</span>
                  </span>
                </>
              )}
              <span style={{ color: C.textWeak, fontSize: 10 }}>· Updated {repo.lastScan}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
            <button style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.textSecondary, borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
              <FolderOpen size={11} /> Folder
            </button>
            <button style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.textSecondary, borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Terminal size={11} /> Terminal
            </button>
            <button
              onClick={onOpenSettings}
              style={{
                background: C.panel2,
                border: `1px solid ${C.border}`,
                color: C.textSecondary,
                borderRadius: 6,
                padding: '5px 8px',
                cursor: 'pointer',
                fontSize: 11,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <Settings2 size={13} />
            </button>
          </div>
        </div>
      </div>

      <div style={{ background: C.panel2, borderBottom: `1px solid ${C.border}`, padding: '8px 14px', display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
        <ToolbarBtn label="Stage All" icon={<PlusSquare size={12} />} onClick={handleStageAll} disabled={files.length === 0 || stagedIds.size === files.length} />
        <ToolbarBtn label="Unstage All" icon={<MinusSquare size={12} />} onClick={handleUnstageAll} disabled={stagedIds.size === 0} />
        <div style={{ width: 1, height: 18, background: C.border, margin: '0 2px' }} />
        <ToolbarBtn label="Generate AI Message" icon={<Sparkles size={12} />} disabled={!hasStaged} accent onClick={() => setMainTab('changes')} />
        <ToolbarBtn label="Commit" icon={<GitCommit size={12} />} disabled={!hasStaged || !hasCommitMsg} primary onClick={() => {}} />
        <div style={{ width: 1, height: 18, background: C.border, margin: '0 2px' }} />
        <ToolbarBtn label="Pull" icon={<Download size={12} />} warning={hasPull && repo.modified > 0} onClick={() => {}} />
        <ToolbarBtn label="Push" icon={<Upload size={12} />} dimmed={!hasPush} onClick={() => {}} />
        <div style={{ flex: 1 }} />
        <button style={{ background: 'none', border: 'none', color: C.textWeak, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '4px 6px' }}>
          <RefreshCw size={11} /> Refresh
        </button>
      </div>

      {isConflict && <ConflictBanner repo={repo} />}

      <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${C.border}`, background: C.panel1, flexShrink: 0, padding: '0 14px' }}>
        {mainTabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setMainTab(tab.key)}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: `2px solid ${mainTab === tab.key ? C.btnPrimary : 'transparent'}`,
              color: mainTab === tab.key ? C.textPrimary : C.textWeak,
              padding: '8px 14px',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: mainTab === tab.key ? 500 : 400,
              transition: 'all 0.1s',
              whiteSpace: 'nowrap',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {mainTab === 'history' ? (
        <HistoryTab commits={repo.history} />
      ) : mainTab === 'activity' ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textWeak, fontSize: 12 }}>
          Activity log — no events yet
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          <DiffList
            files={files}
            selectedFileId={selectedFileId}
            onSelectFile={id => setSelectedFileId(id)}
            stagedIds={stagedIds}
            onToggleStaged={handleToggleStaged}
            onStageAll={handleStageAll}
            onUnstageAll={handleUnstageAll}
          />
          <AiCommitPanel
            stagedCount={stagedIds.size}
            stagedPaths={stagedFiles.map(file => file.path)}
            candidates={commitCandidates}
            message={commitMessage}
            onMessageChange={setCommitMessage}
          />
        </div>
      )}
    </div>
  );
}
