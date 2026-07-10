import { useState } from 'react';
import {
  FolderPlus,
  ChevronDown,
  ChevronRight,
  Download,
  GitBranch,
  Loader2,
  RefreshCw,
  Search,
  Upload,
} from 'lucide-react';
import { useRepoTerminalStatuses } from '../repo-terminal-status';
import type { RepoTerminalState } from '../repo-terminal-status';
import { C } from '../theme';
import { formatAutoScanLabel } from '../settings';
import type { AppSettings, Repo } from '../types';
import { RepoListStatus } from './repo-list-status';
import { RepoTerminalIndicator } from './repo-terminal-indicator';

interface SidebarProps {
  repos: Repo[];
  categories: string[];
  scannedAt: string;
  settings: AppSettings;
  batchAction: 'pull' | 'push' | null;
  isRefreshing: boolean;
  recentError: string | null;
  selectedRepoId: string;
  onSelectRepo: (id: string) => void;
  onPullAll: () => void;
  onPushAll: () => void;
  onRefresh: () => void;
  onOpenAddMenu: () => void;
  onToggleAutoScan: () => void;
}

function RepoItem({
  repo,
  selected,
  terminalState,
  onClick,
}: {
  repo: Repo;
  selected: boolean;
  terminalState?: RepoTerminalState;
  onClick: () => void;
}) {
  const hasCriticalState = repo.status === 'error' || repo.conflicts > 0;
  const itemBackground = selected ? C.selectedBg : 'transparent';

  return (
    <div
      onClick={onClick}
      style={{
        background: itemBackground,
        border: `1px solid ${selected ? C.borderLight : 'transparent'}`,
        borderRadius: 8,
        padding: '8px 10px 8px 12px',
        cursor: 'pointer',
        transition: 'background 0.15s, border-color 0.15s',
      }}
      onMouseEnter={e => {
        if (!selected) {
          (e.currentTarget as HTMLDivElement).style.background = C.hoverBg;
          (e.currentTarget as HTMLDivElement).style.borderColor = `${C.border}55`;
        }
      }}
      onMouseLeave={e => {
        if (!selected) {
          (e.currentTarget as HTMLDivElement).style.background = 'transparent';
          (e.currentTarget as HTMLDivElement).style.borderColor = 'transparent';
        }
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
          <RepoTerminalIndicator state={terminalState} selected={selected} />
          <span
            style={{
              color: selected || hasCriticalState ? C.textPrimary : C.textSecondary,
              fontSize: 13,
              fontWeight: selected ? 600 : 500,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {repo.name}
          </span>
        </div>
        <RepoListStatus repo={repo} />
      </div>
    </div>
  );
}

function CategoryGroup({
  name,
  repos,
  terminalStates,
  selectedRepoId,
  onSelectRepo,
}: {
  name: string;
  repos: Repo[];
  terminalStates: Record<string, RepoTerminalState>;
  selectedRepoId: string;
  onSelectRepo: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div style={{ margin: '0 8px 10px' }}>
      <div
        onClick={() => setOpen(value => !value)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '6px 10px',
          borderRadius: 8,
          cursor: 'pointer',
          userSelect: 'none',
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLDivElement).style.background = C.hoverBg;
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLDivElement).style.background = 'transparent';
        }}
      >
        {open ? <ChevronDown size={12} color={C.textWeak} /> : <ChevronRight size={12} color={C.textWeak} />}
        <span
          style={{
            color: C.textWeak,
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            flex: 1,
          }}
        >
          {name}
        </span>
      </div>
      {open && (
        <div
          style={{
            marginTop: 4,
            marginLeft: 18,
            paddingLeft: 10,
            paddingRight: 2,
            borderLeft: `1px solid ${C.border}`,
            display: 'flex',
            flexDirection: 'column',
            gap: 3,
          }}
        >
          {repos.map(repo => (
            <RepoItem
              key={repo.id}
              repo={repo}
              selected={repo.id === selectedRepoId}
              terminalState={terminalStates[repo.id]}
              onClick={() => onSelectRepo(repo.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function Sidebar({
  repos,
  categories,
  scannedAt,
  settings,
  batchAction,
  isRefreshing,
  recentError,
  selectedRepoId,
  onSelectRepo,
  onPullAll,
  onPushAll,
  onRefresh,
  onOpenAddMenu,
  onToggleAutoScan,
}: SidebarProps) {
  const [search, setSearch] = useState('');
  const terminalStates = useRepoTerminalStatuses();
  const hasPendingRepoScan = repos.some(repo => repo.status === 'checking');

  const filteredRepos = search
    ? repos.filter(repo =>
        repo.name.toLowerCase().includes(search.toLowerCase()) ||
        repo.branch.toLowerCase().includes(search.toLowerCase()) ||
        repo.path.toLowerCase().includes(search.toLowerCase())
      )
    : repos;

  return (
    <div
      style={{
        width: 300,
        flexShrink: 0,
        background: C.panel1,
        borderRight: `1px solid ${C.border}`,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '14px 14px 10px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div
              style={{
                width: 20,
                height: 20,
                borderRadius: 5,
                background: 'linear-gradient(135deg, #3B82F6, #8B5CF6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <GitBranch size={11} color="white" />
            </div>
            <span style={{ color: C.textPrimary, fontSize: 13, fontWeight: 600, letterSpacing: '-0.01em' }}>
              VibeGit Desk
            </span>
          </div>
          <button
            onClick={onOpenAddMenu}
            style={{
              background: C.panel2,
              border: `1px solid ${C.border}`,
              color: C.textSecondary,
              borderRadius: 5,
              padding: '3px 7px',
              cursor: 'pointer',
              fontSize: 16,
              lineHeight: 1,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <FolderPlus size={13} />
          </button>
        </div>
        <div style={{ color: C.textWeak, fontSize: 11, marginBottom: 10 }}>
          {repos.length} 个仓库
        </div>
        <div style={{ position: 'relative' }}>
          <Search size={12} color={C.textWeak} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="搜索仓库 / 分支 / 路径"
            style={{
              width: '100%',
              background: C.panel2,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              padding: '6px 8px 6px 26px',
              color: C.textSecondary,
              fontSize: 12,
              outline: 'none',
              fontFamily: 'Inter, sans-serif',
              boxSizing: 'border-box',
            }}
          />
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
        {search ? (
          filteredRepos.length > 0 ? (
            filteredRepos.map(repo => (
              <RepoItem
                key={repo.id}
                repo={repo}
                selected={repo.id === selectedRepoId}
                terminalState={terminalStates[repo.id]}
                onClick={() => onSelectRepo(repo.id)}
              />
            ))
          ) : (
            <div style={{ padding: 20, textAlign: 'center', color: C.textWeak, fontSize: 12 }}>
              未找到仓库
            </div>
          )
        ) : (
          categories.map(category => {
            const categoryRepos = repos.filter(repo => repo.category === category);
            return (
              <CategoryGroup
                key={category}
                name={category}
                repos={categoryRepos}
                terminalStates={terminalStates}
                selectedRepoId={selectedRepoId}
                onSelectRepo={onSelectRepo}
              />
            );
          })
        )}
      </div>

      <div style={{ borderTop: `1px solid ${C.border}`, padding: '10px 12px', flexShrink: 0 }}>
        <div style={{ color: C.textWeak, fontSize: 10, marginBottom: 8, fontFamily: 'JetBrains Mono, monospace' }}>
          {hasPendingRepoScan ? '启动扫描中…' : `上次扫描 ${scannedAt.split(' ').at(-1) ?? scannedAt}`}
        </div>
        {recentError && (
          <div style={{ color: C.conflict, fontSize: 10, marginBottom: 8 }}>
            最近错误：{recentError}
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <button
            onClick={onPullAll}
            disabled={batchAction !== null}
            style={{
              flex: 1,
              background: batchAction !== null ? C.panel3 : C.btnPrimary,
              color: batchAction !== null ? C.textWeak : 'white',
              border: `1px solid ${batchAction !== null ? C.border : C.btnPrimary}`,
              borderRadius: 6,
              padding: '7px 0',
              cursor: batchAction !== null ? 'not-allowed' : 'pointer',
              fontSize: 12,
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
              opacity: batchAction !== null ? 0.72 : 1,
            }}
          >
            {batchAction === 'pull' ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={12} />}
            {batchAction === 'pull' ? 'Pull 中…' : '全部 Pull'}
          </button>
          <button
            onClick={onPushAll}
            disabled={batchAction !== null}
            style={{
              flex: 1,
              background: batchAction === 'push' ? C.btnPrimary : C.panel2,
              color: batchAction === 'push' ? 'white' : batchAction !== null ? C.textWeak : C.textSecondary,
              border: `1px solid ${batchAction === 'push' ? C.btnPrimary : C.border}`,
              borderRadius: 6,
              padding: '7px 0',
              cursor: batchAction !== null ? 'not-allowed' : 'pointer',
              fontSize: 12,
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
              opacity: batchAction !== null && batchAction !== 'push' ? 0.72 : 1,
            }}
          >
            {batchAction === 'push' ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={12} />}
            {batchAction === 'push' ? 'Push 中…' : '全部 Push'}
          </button>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            style={{
              background: isRefreshing ? C.panel3 : C.panel2,
              color: isRefreshing ? C.textWeak : C.textSecondary,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              padding: '5px 10px',
              cursor: isRefreshing ? 'not-allowed' : 'pointer',
              fontSize: 11,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              opacity: isRefreshing ? 0.78 : 1,
            }}
          >
            {isRefreshing ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={11} />}
            {isRefreshing ? '扫描中…' : '扫描'}
          </button>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
            <div
              onClick={onToggleAutoScan}
              style={{
                width: 28,
                height: 16,
                borderRadius: 8,
                background: settings.gitBehavior.autoScanEnabled ? C.btnPrimary : C.panel3,
                border: `1px solid ${settings.gitBehavior.autoScanEnabled ? C.btnPrimary : C.border}`,
                cursor: 'pointer',
                position: 'relative',
                transition: 'all 0.15s',
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 2,
                  left: settings.gitBehavior.autoScanEnabled ? 13 : 2,
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: 'white',
                  transition: 'left 0.15s',
                }}
              />
            </div>
            <span style={{ color: C.textWeak, fontSize: 11 }}>{formatAutoScanLabel(settings)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
