import { useState } from 'react';
import { useRepoTerminalStatuses } from '../features/terminal/terminal-workspace';
import { C } from '../theme';
import type { AppSettings, Repo } from '../domain/types';
import { SidebarFooter } from './sidebar-footer';
import { SidebarHeader } from './sidebar-header';
import { SidebarRepoList } from './sidebar-repo-list';

interface SidebarProps {
  repos: Repo[];
  categories: string[];
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
}

export function Sidebar(props: SidebarProps) {
  const [search, setSearch] = useState('');
  const terminalStates = useRepoTerminalStatuses();
  return (
    <div style={sidebarStyle}>
      <SidebarHeader search={search} onSearch={setSearch} onOpenAddMenu={props.onOpenAddMenu} />
      <SidebarRepoList
        repos={props.repos}
        categories={props.categories}
        favoriteRepoIds={props.settings.favoriteRepoIds}
        search={search}
        terminalStates={terminalStates}
        selectedRepoId={props.selectedRepoId}
        onSelectRepo={props.onSelectRepo}
      />
      <SidebarFooter
        batchAction={props.batchAction}
        isRefreshing={props.isRefreshing}
        recentError={props.recentError}
        onPullAll={props.onPullAll}
        onPushAll={props.onPushAll}
        onRefresh={props.onRefresh}
      />
    </div>
  );
}

const sidebarStyle = {
  width: 300,
  flexShrink: 0,
  background: C.panel1,
  borderRight: `1px solid ${C.border}`,
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  overflow: 'hidden',
} as const;
