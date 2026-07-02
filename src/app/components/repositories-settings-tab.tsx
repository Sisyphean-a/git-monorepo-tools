import { GripVertical, Plus, Trash2 } from 'lucide-react';
import { C } from '../theme';
import type { AppSettings, Repo } from '../types';

interface RepositoriesSettingsTabProps {
  repos: Repo[];
  settings: AppSettings;
  onAddScanRoot: () => Promise<void>;
  onAddCategory: () => void;
  onRemoveScanRoot: (path: string) => void;
}

export function RepositoriesSettingsTab({
  repos,
  settings,
  onAddScanRoot,
  onAddCategory,
  onRemoveScanRoot,
}: RepositoriesSettingsTabProps) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ color: C.textSecondary, fontSize: 12, fontWeight: 600 }}>仓库（{repos.length}）</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => void onAddScanRoot()}
            style={{ background: C.panel1, border: `1px solid ${C.border}`, color: C.textSecondary, borderRadius: 5, padding: '5px 10px', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <Plus size={11} /> 添加文件夹
          </button>
          <button
            onClick={onAddCategory}
            style={{ background: C.btnPrimary, border: 'none', color: 'white', borderRadius: 5, padding: '5px 10px', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <Plus size={11} /> 添加分类
          </button>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ color: C.textSecondary, fontSize: 12, fontWeight: 600, marginBottom: 8 }}>已配置扫描目录（{settings.scanRoots.length}）</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {settings.scanRoots.length === 0 && (
            <div style={{ color: C.textWeak, fontSize: 11, background: C.panel1, border: `1px dashed ${C.border}`, borderRadius: 6, padding: '10px 12px' }}>
              当前未配置扫描目录
            </div>
          )}
          {settings.scanRoots.map(root => (
            <div
              key={root.path}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: C.panel1,
                border: `1px solid ${C.border}`,
                borderRadius: 6,
                padding: '8px 10px',
              }}
            >
              <GripVertical size={12} color={C.textWeak} style={{ cursor: 'grab', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: C.textPrimary, fontSize: 12, fontWeight: 500 }}>{root.category}</div>
                <div style={{ color: C.textWeak, fontSize: 10, fontFamily: 'JetBrains Mono, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {root.path}
                </div>
              </div>
              <button onClick={() => onRemoveScanRoot(root.path)} style={{ background: 'none', border: 'none', color: C.textWeak, cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center' }}>
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ color: C.textSecondary, fontSize: 12, fontWeight: 600, marginBottom: 8 }}>自定义分类（{settings.customCategories.length}）</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {settings.customCategories.length === 0 && (
            <span style={{ color: C.textWeak, fontSize: 11 }}>当前没有额外分类</span>
          )}
          {settings.customCategories.map(category => (
            <span key={category} style={{ color: C.textSecondary, fontSize: 11, background: C.panel1, border: `1px solid ${C.border}`, borderRadius: 999, padding: '4px 10px' }}>
              {category}
            </span>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {repos.map(repo => (
          <div
            key={repo.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: C.panel1,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              padding: '8px 10px',
            }}
          >
            <GripVertical size={12} color={C.textWeak} style={{ cursor: 'grab', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: C.textPrimary, fontSize: 12, fontWeight: 500 }}>{repo.name}</div>
              <div style={{ color: C.textWeak, fontSize: 10, fontFamily: 'JetBrains Mono, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {repo.path}
              </div>
            </div>
            <span style={{ color: C.textWeak, fontSize: 10, background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 3, padding: '2px 6px', flexShrink: 0 }}>
              {repo.category}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
