import { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  FolderGit2,
  GitBranch,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Upload,
} from 'lucide-react';
import { C } from '../theme';
import { CATEGORIES, REPOS, SCANNED_AT } from '../data';
import type { Repo } from '../types';
import { StatusPill } from './common';

interface SidebarProps {
  selectedRepoId: string;
  onSelectRepo: (id: string) => void;
  onPullAll: () => void;
  onOpenSettings: () => void;
}

function RepoItem({ repo, selected, onClick }: { repo: Repo; selected: boolean; onClick: () => void }) {
  const leftBarColor =
    repo.conflicts > 0 ? C.conflict :
    repo.modified > 0 ? C.modified :
    repo.ahead > 0 ? C.needPush :
    repo.behind > 0 ? C.needPull :
    'transparent';

  return (
    <div
      onClick={onClick}
      style={{
        background: selected ? C.selectedBg : 'transparent',
        borderLeft: `3px solid ${leftBarColor}`,
        borderRadius: 6,
        padding: '7px 10px 7px 8px',
        cursor: 'pointer',
        transition: 'background 0.1s',
        margin: '1px 6px',
      }}
      onMouseEnter={e => {
        if (!selected) {
          (e.currentTarget as HTMLDivElement).style.background = C.hoverBg;
        }
      }}
      onMouseLeave={e => {
        if (!selected) {
          (e.currentTarget as HTMLDivElement).style.background = 'transparent';
        }
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
          {repo.status === 'checking' ? (
            <Loader2 size={12} color={C.textWeak} style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
          ) : repo.conflicts > 0 ? (
            <AlertTriangle size={12} color={C.conflict} style={{ flexShrink: 0 }} />
          ) : (
            <FolderGit2
              size={12}
              color={repo.modified > 0 ? C.modified : repo.ahead > 0 ? C.needPush : repo.behind > 0 ? C.needPull : C.clean}
              style={{ flexShrink: 0 }}
            />
          )}
          <span
            style={{
              color: repo.modified > 0 || repo.ahead > 0 || repo.behind > 0 || repo.conflicts > 0 ? C.textPrimary : C.textSecondary,
              fontSize: 13,
              fontWeight: 500,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {repo.name}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 3, flexShrink: 0, alignItems: 'center' }}>
          {repo.conflicts > 0 && <StatusPill color={C.conflict}>⚠</StatusPill>}
          {repo.modified > 0 && <StatusPill color={C.modified}>M {repo.modified}</StatusPill>}
          {repo.ahead > 0 && <StatusPill color={C.needPush}>↑{repo.ahead}</StatusPill>}
          {repo.behind > 0 && <StatusPill color={C.needPull}>↓{repo.behind}</StatusPill>}
          {!repo.modified && !repo.ahead && !repo.behind && !repo.conflicts && repo.status !== 'checking' && (
            <CheckCircle2 size={11} color={C.clean} />
          )}
        </div>
      </div>
    </div>
  );
}

function CategoryGroup({
  name,
  repos,
  selectedRepoId,
  onSelectRepo,
}: {
  name: string;
  repos: Repo[];
  selectedRepoId: string;
  onSelectRepo: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const totalModified = repos.reduce((sum, repo) => sum + repo.modified, 0);
  const totalPush = repos.reduce((sum, repo) => sum + (repo.ahead > 0 ? 1 : 0), 0);
  const totalPull = repos.reduce((sum, repo) => sum + (repo.behind > 0 ? 1 : 0), 0);
  const totalConflict = repos.reduce((sum, repo) => sum + repo.conflicts, 0);

  return (
    <div style={{ marginBottom: 2 }}>
      <div
        onClick={() => setOpen(value => !value)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '5px 10px',
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
        <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
          {totalModified > 0 && <StatusPill color={C.modified}>{totalModified}</StatusPill>}
          {totalPush > 0 && <StatusPill color={C.needPush}>↑{totalPush}</StatusPill>}
          {totalPull > 0 && <StatusPill color={C.needPull}>↓{totalPull}</StatusPill>}
          {totalConflict > 0 && <StatusPill color={C.conflict}>⚠</StatusPill>}
        </div>
      </div>
      {open && repos.map(repo => (
        <RepoItem
          key={repo.id}
          repo={repo}
          selected={repo.id === selectedRepoId}
          onClick={() => onSelectRepo(repo.id)}
        />
      ))}
    </div>
  );
}

export function Sidebar({ selectedRepoId, onSelectRepo, onPullAll, onOpenSettings }: SidebarProps) {
  const [search, setSearch] = useState('');
  const [autoScan, setAutoScan] = useState(true);

  const totalChanged = REPOS.filter(repo => repo.modified > 0 || repo.conflicts > 0).length;
  const totalPush = REPOS.filter(repo => repo.ahead > 0).length;
  const totalClean = REPOS.filter(repo => repo.status === 'clean').length;
  const totalConflicts = REPOS.reduce((sum, repo) => sum + repo.conflicts, 0);

  const filteredRepos = search
    ? REPOS.filter(repo =>
        repo.name.toLowerCase().includes(search.toLowerCase()) ||
        repo.branch.toLowerCase().includes(search.toLowerCase()) ||
        repo.path.toLowerCase().includes(search.toLowerCase())
      )
    : REPOS;

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
            onClick={() => {}}
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
            <Plus size={13} />
          </button>
        </div>
        <div style={{ color: C.textWeak, fontSize: 11, marginBottom: 10 }}>
          {REPOS.length} repos · {totalChanged} changed · {totalPush} to push
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
                onClick={() => onSelectRepo(repo.id)}
              />
            ))
          ) : (
            <div style={{ padding: 20, textAlign: 'center', color: C.textWeak, fontSize: 12 }}>
              No repos found
            </div>
          )
        ) : (
          CATEGORIES.map(category => {
            const categoryRepos = REPOS.filter(repo => repo.category === category);
            if (categoryRepos.length === 0) return null;
            return (
              <CategoryGroup
                key={category}
                name={category}
                repos={categoryRepos}
                selectedRepoId={selectedRepoId}
                onSelectRepo={onSelectRepo}
              />
            );
          })
        )}
      </div>

      <div style={{ borderTop: `1px solid ${C.border}`, padding: '10px 12px', flexShrink: 0 }}>
        <div style={{ color: C.textWeak, fontSize: 10, marginBottom: 8, fontFamily: 'JetBrains Mono, monospace' }}>
          Last scan {SCANNED_AT.split(' ').at(-1) ?? SCANNED_AT} · {totalClean} clean · {totalChanged} changed · {totalConflicts} conflicts
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <button
            onClick={onPullAll}
            style={{
              flex: 1,
              background: C.btnPrimary,
              color: 'white',
              border: 'none',
              borderRadius: 6,
              padding: '7px 0',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
            }}
          >
            <Download size={12} /> Pull All
          </button>
          <button
            style={{
              flex: 1,
              background: C.panel2,
              color: C.textSecondary,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              padding: '7px 0',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
            }}
          >
            <Upload size={12} /> Push All
          </button>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            style={{
              background: C.panel2,
              color: C.textSecondary,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              padding: '5px 10px',
              cursor: 'pointer',
              fontSize: 11,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <RefreshCw size={11} /> Scan
          </button>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
            <div
              onClick={() => setAutoScan(value => !value)}
              style={{
                width: 28,
                height: 16,
                borderRadius: 8,
                background: autoScan ? C.btnPrimary : C.panel3,
                border: `1px solid ${autoScan ? C.btnPrimary : C.border}`,
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
                  left: autoScan ? 13 : 2,
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: 'white',
                  transition: 'left 0.15s',
                }}
              />
            </div>
            <span style={{ color: C.textWeak, fontSize: 11 }}>Auto scan: 60s</span>
          </div>
          <button onClick={onOpenSettings} style={{ background: 'none', border: 'none', color: C.textWeak, cursor: 'pointer', display: 'flex' }}>
            <Settings size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
