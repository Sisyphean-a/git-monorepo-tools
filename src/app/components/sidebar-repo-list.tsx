import { CheckCircle2, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { RepoTerminalState } from '../features/terminal/terminal-workspace';
import { C } from '../theme';
import { shouldShowCleanIndicator } from '../domain/repo-status';
import {
  aggregateWorktreeGroupStatus,
  favoriteWorktreeGroups,
  filterWorktreeGroups,
  findWorktreeGroup,
  groupReposByWorktree,
  nonFavoriteWorktreeGroups,
  worktreeGroupConflicts,
  worktreeGroupHasRemoteError,
  worktreeGroupModified,
  type WorktreeGroup,
} from '../domain/worktree-groups';
import type { Repo } from '../domain/types';
import { RepoListStatus } from './repo-list-status';
import { RepoTerminalIndicator } from './repo-terminal-indicator';
import { StatusPill } from './common';

interface SidebarRepoListProps {
  repos: Repo[];
  categories: string[];
  favoriteRepoIds: string[];
  search: string;
  terminalStates: Record<string, RepoTerminalState>;
  selectedRepoId: string;
  onSelectRepo: (id: string) => void;
}

interface WorktreeRenderProps {
  selectedRepoId: string;
  terminalStates: Record<string, RepoTerminalState>;
  onSelectRepo: (id: string) => void;
  openGroup: (group: WorktreeGroup) => void;
  toggleGroup: (group: WorktreeGroup, open: boolean) => void;
  isGroupOpen: (group: WorktreeGroup) => boolean;
}

export function SidebarRepoList(props: SidebarRepoListProps) {
  const query = props.search.trim();
  const searching = query.length > 0;
  const groups = groupReposByWorktree(props.repos);
  const selectedGroup = findWorktreeGroup(groups, props.selectedRepoId);
  const [groupOpenState, setGroupOpenState] = useState<Record<string, boolean>>({});

  const openGroup = (group: WorktreeGroup) => {
    setGroupOpenState(current => ({ ...current, [group.id]: true }));
    // Rule: 搜索过滤后组内只剩命中成员时，选中第一个可见成员，避免打开被过滤掉的主工作树。
    props.onSelectRepo(group.repos[0]?.id ?? group.representativeId);
  };
  const toggleGroup = (group: WorktreeGroup, open: boolean) => {
    setGroupOpenState(current => ({ ...current, [group.id]: !open }));
  };
  // Rule: 组默认折叠；当前选中组或搜索命中时展开，用户手动折叠后保持折叠。
  const isGroupOpen = (group: WorktreeGroup) =>
    searching || (groupOpenState[group.id] ?? (group.id === selectedGroup?.id));

  const render: WorktreeRenderProps = {
    selectedRepoId: props.selectedRepoId,
    terminalStates: props.terminalStates,
    onSelectRepo: props.onSelectRepo,
    openGroup,
    toggleGroup,
    isGroupOpen,
  };

  const visibleGroups = searching ? filterWorktreeGroups(groups, query) : groups;
  const favoriteGroups = searching ? [] : favoriteWorktreeGroups(visibleGroups, props.favoriteRepoIds);
  const remainingGroups = searching ? [] : nonFavoriteWorktreeGroups(visibleGroups, props.favoriteRepoIds);

  return (
    <div style={listStyle}>
      {searching ? (
        visibleGroups.length === 0
          ? <div style={emptyStyle}>未找到仓库</div>
          : visibleGroups.map(group => <WorktreeEntry key={group.id} group={group} render={render} forceOpen />)
      ) : (
        <>
          {favoriteGroups.length > 0 && <CategoryGroup name="收藏" groups={favoriteGroups} render={render} />}
          {props.categories.map(category => (
            <CategoryGroup
              key={category}
              name={category}
              groups={remainingGroups.filter(group => group.category === category)}
              render={render}
            />
          ))}
        </>
      )}
    </div>
  );
}

function CategoryGroup({
  name,
  groups,
  render,
}: {
  name: string;
  groups: WorktreeGroup[];
  render: WorktreeRenderProps;
}) {
  const [open, setOpen] = useState(true);
  const previousCountRef = useRef(groups.length);
  useEffect(() => {
    // Rule: 分类内仓库数量增加（例如新添加目录）时自动展开，避免列表更新被折叠状态掩盖。
    if (groups.length > previousCountRef.current) setOpen(true);
    previousCountRef.current = groups.length;
  }, [groups.length]);
  return (
    <div style={groupStyle}>
      <button className="sidebar-category-button" onClick={() => setOpen(value => !value)} style={groupButtonStyle}>
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span style={groupNameStyle}>{name}</span>
      </button>
      {open && (
        <div style={groupItemsStyle}>
          {groups.map(group => <WorktreeEntry key={group.id} group={group} render={render} />)}
        </div>
      )}
    </div>
  );
}

function WorktreeEntry({
  group,
  render,
  forceOpen = false,
}: {
  group: WorktreeGroup;
  render: WorktreeRenderProps;
  forceOpen?: boolean;
}) {
  if (group.total <= 1) {
    const repo = group.repos[0];
    if (!repo) return null;
    return (
      <RepoItem
        repo={repo}
        selected={repo.id === render.selectedRepoId}
        terminalState={render.terminalStates[repo.id]}
        onClick={() => render.onSelectRepo(repo.id)}
      />
    );
  }

  return (
    <WorktreeGroupItem
      group={group}
      open={forceOpen || render.isGroupOpen(group)}
      lockedOpen={forceOpen}
      render={render}
    />
  );
}

function WorktreeGroupItem({
  group,
  open,
  lockedOpen,
  render,
}: {
  group: WorktreeGroup;
  open: boolean;
  lockedOpen: boolean;
  render: WorktreeRenderProps;
}) {
  const selected = group.repos.some(repo => repo.id === render.selectedRepoId);
  const terminalState = group.repos.map(repo => render.terminalStates[repo.id]).find(Boolean);
  const chevron = open ? <ChevronDown size={12} /> : <ChevronRight size={12} />;
  return (
    <div style={worktreeGroupStyle}>
      <div className="sidebar-worktree-group" data-selected={selected} style={worktreeGroupRowStyle(selected)}>
        {lockedOpen ? (
          <span style={chevronBoxStyle} aria-hidden="true">{chevron}</span>
        ) : (
          <button
            type="button"
            className="sidebar-worktree-toggle"
            aria-expanded={open}
            aria-label={open ? `折叠 ${group.name}` : `展开 ${group.name}`}
            onClick={() => render.toggleGroup(group, open)}
            style={chevronButtonStyle}
          >
            {chevron}
          </button>
        )}
        <button
          type="button"
          className="sidebar-worktree-main"
          title={group.name}
          onClick={() => render.openGroup(group)}
          style={worktreeMainButtonStyle}
        >
          <RepoTerminalIndicator state={terminalState} selected={selected} size={13} />
          <span style={worktreeNameStyle(selected)}>{group.name}</span>
          <span style={worktreeCountStyle}>{group.total}</span>
        </button>
        <WorktreeGroupStatus repos={group.repos} />
      </div>
      {open && (
        <div style={worktreeChildrenStyle}>
          {group.repos.map(repo => (
            <RepoItem
              key={repo.id}
              repo={repo}
              selected={repo.id === render.selectedRepoId}
              terminalState={render.terminalStates[repo.id]}
              onClick={() => render.onSelectRepo(repo.id)}
              showWorktreeInfo
              isMain={Boolean(repo.isMainWorktree)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RepoItem({
  repo,
  selected,
  terminalState,
  onClick,
  showWorktreeInfo = false,
  isMain = false,
}: {
  repo: Repo;
  selected: boolean;
  terminalState?: RepoTerminalState;
  onClick: () => void;
  showWorktreeInfo?: boolean;
  isMain?: boolean;
}) {
  const critical = repo.status === 'error' || repo.conflicts > 0;
  return (
    <button
      className="sidebar-repo-item"
      data-selected={selected}
      onClick={onClick}
      title={repo.path}
      style={repoItemStyle(selected)}
    >
      <span style={repoNameRowStyle}>
        <RepoTerminalIndicator state={terminalState} selected={selected} />
        <span style={repoNameStyle(selected, critical)}>{repo.name}</span>
        {showWorktreeInfo && isMain && <span style={mainWorktreeTagStyle}>主</span>}
      </span>
      <span style={repoMetaRowStyle}>
        {showWorktreeInfo && <span style={branchLabelStyle} title={`分支 ${repo.branch}`}>{repo.branch}</span>}
        <RepoListStatus repo={repo} />
      </span>
    </button>
  );
}

function WorktreeGroupStatus({ repos }: { repos: Repo[] }) {
  const status = aggregateWorktreeGroupStatus(repos);
  const checking = repos.some(repo => repo.status === 'checking');
  const modified = worktreeGroupModified(repos);
  const conflicts = worktreeGroupConflicts(repos);
  const remoteError = worktreeGroupHasRemoteError(repos);
  const remoteUnknown = repos.some(repo => repo.remote !== '—' && !repo.remoteCheck);
  const clean = !checking && repos.length > 0 && repos.every(shouldShowCleanIndicator);

  if (status === 'checking' && !remoteError && conflicts === 0 && modified === 0) {
    return (
      <div style={groupStatusStyle}>
        <Loader2 size={12} color={C.textSecondary} style={{ animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  return (
    <div style={groupStatusStyle}>
      {checking && <Loader2 size={12} color={C.textSecondary} style={{ animation: 'spin 1s linear infinite' }} />}
      {status === 'error' && <StatusPill color={C.conflict}>ERR</StatusPill>}
      {remoteError && <StatusPill color={C.conflict}>远端失败</StatusPill>}
      {!remoteError && remoteUnknown && <StatusPill color={C.textWeak}>远端未知</StatusPill>}
      {conflicts > 0 && <StatusPill color={C.conflict}>⚠</StatusPill>}
      {modified > 0 && <StatusPill color={C.modified}>M {modified}</StatusPill>}
      {clean && <CheckCircle2 size={11} color={C.clean} aria-label="工作树均干净" />}
    </div>
  );
}

const listStyle = { flex: 1, overflowY: 'auto', padding: '6px 0' } as const;
const emptyStyle = { padding: 20, textAlign: 'center', color: C.textWeak, fontSize: 12 } as const;
const groupStyle = { margin: '0 8px 10px' };
const groupButtonStyle = { display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', width: '100%', border: 0, borderRadius: 8, cursor: 'pointer', color: C.textWeak, background: 'transparent', fontFamily: 'inherit' };
const groupNameStyle = { fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', flex: 1, textAlign: 'left' } as const;
const groupItemsStyle = { marginTop: 4, marginLeft: 18, paddingLeft: 10, paddingRight: 2, borderLeft: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 3 } as const;
const worktreeGroupStyle = { marginBottom: 2 } as const;
const worktreeGroupRowStyle = (selected: boolean) => ({ display: 'flex', alignItems: 'center', gap: 2, background: selected ? C.selectedBg : 'transparent', border: `1px solid ${selected ? C.borderLight : 'transparent'}`, borderRadius: 8, padding: '3px 6px 3px 3px' });
const chevronBoxStyle = { width: 20, height: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: C.textWeak } as const;
const chevronButtonStyle = { ...chevronBoxStyle, background: 'transparent', border: 0, borderRadius: 6, padding: 0, cursor: 'pointer' };
const worktreeMainButtonStyle = { display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0, background: 'transparent', border: 0, padding: '4px 2px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' as const };
const worktreeNameStyle = (selected: boolean) => ({ color: selected ? C.textPrimary : C.textSecondary, fontSize: 13, fontWeight: selected ? 600 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, flex: 1, textAlign: 'left' as const });
const worktreeCountStyle = { color: C.textWeak, fontSize: 10, background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 999, padding: '0 5px', flexShrink: 0 } as const;
const worktreeChildrenStyle = { marginTop: 2, marginLeft: 22, paddingLeft: 8, display: 'flex', flexDirection: 'column', gap: 2, borderLeft: `1px solid ${C.border}` } as const;
const groupStatusStyle = { display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 } as const;
const repoNameRowStyle = { display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 };
const repoMetaRowStyle = { display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, minWidth: 0 } as const;
const branchLabelStyle = { color: C.textWeak, fontSize: 10, fontFamily: 'JetBrains Mono, monospace', maxWidth: 64, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const };
const mainWorktreeTagStyle = { color: C.textWeak, fontSize: 9, background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 3, padding: '0 4px', flexShrink: 0 } as const;
const repoItemStyle = (selected: boolean) => ({ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, background: selected ? C.selectedBg : 'transparent', border: `1px solid ${selected ? C.borderLight : 'transparent'}`, borderRadius: 8, padding: '8px 10px 8px 12px', cursor: 'pointer', textAlign: 'left' as const, fontFamily: 'inherit' });
const repoNameStyle = (selected: boolean, critical: boolean) => ({ color: selected || critical ? C.textPrimary : C.textSecondary, fontSize: 13, fontWeight: selected ? 600 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const });
