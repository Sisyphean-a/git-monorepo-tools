import { FolderPlus, Search } from 'lucide-react';
import { C } from '../theme';

interface SidebarHeaderProps {
  search: string;
  onSearch: (value: string) => void;
  onOpenAddMenu: () => void;
}

export function SidebarHeader({ search, onSearch, onOpenAddMenu }: SidebarHeaderProps) {
  return (
    <div style={headerStyle}>
      <div style={searchBoxStyle}>
        <Search size={12} color={C.textWeak} style={searchIconStyle} />
        <input value={search} onChange={event => onSearch(event.target.value)} placeholder="搜索仓库 / 分支 / 路径" style={inputStyle} />
      </div>
      <button onClick={onOpenAddMenu} style={addButtonStyle} aria-label="添加仓库或分类" title="添加仓库或分类">
        <FolderPlus size={13} />
      </button>
    </div>
  );
}

const headerStyle = { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: `1px solid ${C.border}` };
const searchBoxStyle = { position: 'relative', flex: 1, minWidth: 0 } as const;
const searchIconStyle = { position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)' } as const;
const addButtonStyle = { width: 28, height: 28, flexShrink: 0, background: C.panel2, border: `1px solid ${C.border}`, color: C.textSecondary, borderRadius: 6, padding: 0, cursor: 'pointer', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' };
const inputStyle = { width: '100%', height: 28, background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 6, padding: '0 8px 0 26px', color: C.textSecondary, fontSize: 12, outline: 'none', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box' } as const;
