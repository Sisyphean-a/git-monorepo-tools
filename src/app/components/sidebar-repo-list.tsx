import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import type { RepoTerminalState } from '../features/terminal/repo-terminal-status';
import { C } from '../theme';
import type { Repo } from '../domain/types';
import { RepoListStatus } from './repo-list-status';
import { RepoTerminalIndicator } from './repo-terminal-indicator';

interface SidebarRepoListProps {
  repos: Repo[];
  categories: string[];
  search: string;
  terminalStates: Record<string, RepoTerminalState>;
  selectedRepoId: string;
  onSelectRepo: (id: string) => void;
}

export function SidebarRepoList(props: SidebarRepoListProps) {
  const query = props.search.toLowerCase();
  const filtered = query ? props.repos.filter(repo => matchesSearch(repo, query)) : props.repos;
  const grouped = query ? null : groupReposByCategory(filtered);
  return (
    <div style={listStyle}>
      {query ? <SearchResults {...props} repos={filtered} /> : props.categories.map(category => (
        <CategoryGroup key={category} {...props} name={category} repos={grouped?.get(category) ?? []} />
      ))}
    </div>
  );
}

function SearchResults(props: SidebarRepoListProps) {
  if (props.repos.length === 0) return <div style={emptyStyle}>未找到仓库</div>;
  return <>{props.repos.map(repo => <RepoItem key={repo.id} repo={repo} {...itemProps(props, repo)} />)}</>;
}

function CategoryGroup(props: SidebarRepoListProps & { name: string }) {
  const [open, setOpen] = useState(true);
  return (
    <div style={groupStyle}>
      <button className="sidebar-category-button" onClick={() => setOpen(value => !value)} style={groupButtonStyle}>
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span style={groupNameStyle}>{props.name}</span>
      </button>
      {open && <div style={groupItemsStyle}>{props.repos.map(repo => <RepoItem key={repo.id} repo={repo} {...itemProps(props, repo)} />)}</div>}
    </div>
  );
}

function RepoItem({ repo, selected, terminalState, onClick }: { repo: Repo; selected: boolean; terminalState?: RepoTerminalState; onClick: () => void }) {
  const critical = repo.status === 'error' || repo.conflicts > 0;
  return (
    <button className="sidebar-repo-item" data-selected={selected} onClick={onClick} style={repoItemStyle(selected)}>
      <span style={repoNameRowStyle}>
        <RepoTerminalIndicator state={terminalState} selected={selected} />
        <span style={repoNameStyle(selected, critical)}>{repo.name}</span>
      </span>
      <RepoListStatus repo={repo} />
    </button>
  );
}

function itemProps(props: SidebarRepoListProps, repo: Repo) {
  return { selected: repo.id === props.selectedRepoId, terminalState: props.terminalStates[repo.id], onClick: () => props.onSelectRepo(repo.id) };
}

function matchesSearch(repo: Repo, query: string) {
  return repo.name.toLowerCase().includes(query) || repo.branch.toLowerCase().includes(query) || repo.path.toLowerCase().includes(query);
}

function groupReposByCategory(repos: Repo[]) {
  const grouped = new Map<string, Repo[]>();
  for (const repo of repos) {
    const categoryRepos = grouped.get(repo.category);
    if (categoryRepos) {
      categoryRepos.push(repo);
    } else {
      grouped.set(repo.category, [repo]);
    }
  }
  return grouped;
}

const listStyle = { flex: 1, overflowY: 'auto', padding: '6px 0' } as const;
const emptyStyle = { padding: 20, textAlign: 'center', color: C.textWeak, fontSize: 12 } as const;
const groupStyle = { margin: '0 8px 10px' };
const groupButtonStyle = { display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', width: '100%', border: 0, borderRadius: 8, cursor: 'pointer', color: C.textWeak, background: 'transparent', fontFamily: 'inherit' };
const groupNameStyle = { fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', flex: 1, textAlign: 'left' } as const;
const groupItemsStyle = { marginTop: 4, marginLeft: 18, paddingLeft: 10, paddingRight: 2, borderLeft: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 3 } as const;
const repoNameRowStyle = { display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 };
const repoItemStyle = (selected: boolean) => ({ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, background: selected ? C.selectedBg : 'transparent', border: `1px solid ${selected ? C.borderLight : 'transparent'}`, borderRadius: 8, padding: '8px 10px 8px 12px', cursor: 'pointer', textAlign: 'left' as const, fontFamily: 'inherit' });
const repoNameStyle = (selected: boolean, critical: boolean) => ({ color: selected || critical ? C.textPrimary : C.textSecondary, fontSize: 13, fontWeight: selected ? 600 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const });
