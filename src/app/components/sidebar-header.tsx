import { FolderPlus, GitBranch, Search } from 'lucide-react';
import { C } from '../theme';
import type { Repo } from '../domain/types';

interface SidebarHeaderProps {
  repos: Repo[];
  search: string;
  onSearch: (value: string) => void;
  onOpenAddMenu: () => void;
}

export function SidebarHeader({ repos, search, onSearch, onOpenAddMenu }: SidebarHeaderProps) {
  return (
    <div style={headerStyle}>
      <div style={titleRowStyle}>
        <div style={brandStyle}>
          <div style={logoStyle}><GitBranch size={11} color="white" /></div>
          <span style={titleStyle}>VibeGit Desk</span>
        </div>
        <button onClick={onOpenAddMenu} style={addButtonStyle} aria-label="添加仓库或分类">
          <FolderPlus size={13} />
        </button>
      </div>
      <div style={countStyle}>{repos.length} 个仓库</div>
      <div style={{ position: 'relative' }}>
        <Search size={12} color={C.textWeak} style={searchIconStyle} />
        <input value={search} onChange={event => onSearch(event.target.value)} placeholder="搜索仓库 / 分支 / 路径" style={inputStyle} />
      </div>
    </div>
  );
}

const headerStyle = { padding: '14px 14px 10px', borderBottom: `1px solid ${C.border}` };
const titleRowStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 };
const brandStyle = { display: 'flex', alignItems: 'center', gap: 7 };
const logoStyle = { width: 20, height: 20, borderRadius: 5, background: 'linear-gradient(135deg, #3B82F6, #8B5CF6)', display: 'flex', alignItems: 'center', justifyContent: 'center' };
const titleStyle = { color: C.textPrimary, fontSize: 13, fontWeight: 600, letterSpacing: '-0.01em' };
const countStyle = { color: C.textWeak, fontSize: 11, marginBottom: 10 };
const searchIconStyle = { position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)' } as const;
const addButtonStyle = { background: C.panel2, border: `1px solid ${C.border}`, color: C.textSecondary, borderRadius: 5, padding: '3px 7px', cursor: 'pointer', lineHeight: 1, display: 'flex', alignItems: 'center' };
const inputStyle = { width: '100%', background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 8px 6px 26px', color: C.textSecondary, fontSize: 12, outline: 'none', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box' } as const;
