import { GripVertical, Plus, Star, Trash2 } from 'lucide-react';
import { C } from '../theme.js';
import { groupReposByWorktree, isWorktreeGroupFavorite, type WorktreeGroup } from '../domain/worktree-groups.js';
import type { AppSettings, Repo } from '../domain/types.js';

interface RepositoriesSettingsTabProps {
  repos: Repo[];
  settings: AppSettings;
  onAddScanRoot: () => Promise<void>;
  onAddCategory: () => void;
  onRemoveScanRoot: (path: string) => void;
  onIgnoreRepo: (path: string) => void;
  onUnignoreRepo: (path: string) => void;
  onToggleFavorite: (repoIds: string[]) => void;
}

export function RepositoriesSettingsTab({
  repos,
  settings,
  onAddScanRoot,
  onAddCategory,
  onRemoveScanRoot,
  onIgnoreRepo,
  onUnignoreRepo,
  onToggleFavorite,
}: RepositoriesSettingsTabProps) {
  const monitoredRepos = filterMonitoredRepos(repos, settings.ignoredRepoPaths);
  const monitoredGroups = groupReposByWorktree(monitoredRepos);
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ color: C.textSecondary, fontSize: 12, fontWeight: 600 }}>
          仓库（{monitoredGroups.length}）
          {monitoredRepos.length !== monitoredGroups.length && (
            <span style={{ color: C.textWeak }}> · 工作树（{monitoredRepos.length}）</span>
          )}
        </span>
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {monitoredGroups.map(group => {
          if (group.repos.length <= 1) {
            const repo = group.repos[0];
            if (!repo) return null;
            return (
              <RepositoryRow
                key={repo.id}
                repo={repo}
                favorite={settings.favoriteRepoIds.includes(repo.id)}
                onIgnoreRepo={onIgnoreRepo}
                onToggleFavorite={onToggleFavorite}
              />
            );
          }
          return (
            <WorktreeGroupRows
              key={group.id}
              group={group}
              favorite={isWorktreeGroupFavorite(group, settings.favoriteRepoIds)}
              onIgnoreRepo={onIgnoreRepo}
              onToggleFavorite={onToggleFavorite}
            />
          );
        })}
      </div>

      <div style={{ marginTop: 16 }}>
        <div style={{ color: C.textSecondary, fontSize: 12, fontWeight: 600, marginBottom: 8 }}>已停止监控的项目（{settings.ignoredRepoPaths.length}）</div>
        {settings.ignoredRepoPaths.length === 0 ? (
          <span style={{ color: C.textWeak, fontSize: 11 }}>当前没有停止监控的项目</span>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {settings.ignoredRepoPaths.map(path => (
              <div key={path} style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.panel1, border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 10px' }}>
                <div style={{ color: C.textWeak, fontSize: 10, fontFamily: 'JetBrains Mono, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  {path}
                </div>
                <button
                  type="button"
                  title="恢复监控"
                  onClick={() => onUnignoreRepo(path)}
                  style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.textSecondary, borderRadius: 4, padding: '3px 6px', cursor: 'pointer', fontSize: 10, flexShrink: 0 }}
                >
                  恢复监控
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RepositoryRow({
  repo,
  favorite,
  onIgnoreRepo,
  onToggleFavorite,
}: {
  repo: Repo;
  favorite: boolean;
  onIgnoreRepo: (path: string) => void;
  onToggleFavorite: (repoIds: string[]) => void;
}) {
  return (
    <div style={repoRowStyle}>
      <GripVertical size={12} color={C.textWeak} style={{ cursor: 'grab', flexShrink: 0 }} />
      <RepoInfo repo={repo} />
      <CategoryChip category={repo.category} />
      <StopMonitoringButton repo={repo} onIgnoreRepo={onIgnoreRepo} />
      <FavoriteButton label={repo.name} favorite={favorite} onClick={() => onToggleFavorite([repo.id])} />
    </div>
  );
}

function WorktreeGroupRows({
  group,
  favorite,
  onIgnoreRepo,
  onToggleFavorite,
}: {
  group: WorktreeGroup;
  favorite: boolean;
  onIgnoreRepo: (path: string) => void;
  onToggleFavorite: (repoIds: string[]) => void;
}) {
  return (
    <div style={groupContainerStyle}>
      <div style={groupHeaderStyle}>
        <GripVertical size={12} color={C.textWeak} style={{ cursor: 'grab', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={repoNameStyle}>
            {group.name}
            <span style={groupCountStyle}>· {group.repos.length} 个工作树</span>
          </div>
          <div style={repoPathStyle}>{group.mainRepo?.path ?? group.repos[0]?.path ?? ''}</div>
        </div>
        <CategoryChip category={group.category} />
        <FavoriteButton
          label={`${group.name} 的全部工作树`}
          favorite={favorite}
          onClick={() => onToggleFavorite(group.repos.map(repo => repo.id))}
        />
      </div>
      <div style={groupChildrenStyle}>
        {group.repos.map(repo => (
          <div key={repo.id} style={childRowStyle}>
            <RepoInfo repo={repo} main={Boolean(repo.isMainWorktree)} />
            <span style={metaChipStyle} title={`分支 ${repo.branch}`}>{repo.branch}</span>
            <StopMonitoringButton repo={repo} onIgnoreRepo={onIgnoreRepo} />
          </div>
        ))}
      </div>
    </div>
  );
}

function RepoInfo({ repo, main = false }: { repo: Repo; main?: boolean }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={repoNameStyle}>
        {repo.name}
        {main && <span style={mainTagStyle}>主</span>}
      </div>
      <div style={repoPathStyle}>{repo.path}</div>
    </div>
  );
}

function CategoryChip({ category }: { category: string }) {
  return <span style={metaChipStyle}>{category}</span>;
}

function StopMonitoringButton({ repo, onIgnoreRepo }: { repo: Repo; onIgnoreRepo: (path: string) => void }) {
  return (
    <button
      type="button"
      title={`停止监控 ${repo.name}`}
      onClick={() => onIgnoreRepo(repo.path)}
      style={stopButtonStyle}
    >
      停止监控
    </button>
  );
}

function FavoriteButton({ label, favorite, onClick }: { label: string; favorite: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={favorite ? `取消收藏 ${label}` : `收藏 ${label}`}
      title={favorite ? '取消收藏' : '收藏'}
      onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', color: favorite ? C.modified : C.textWeak, cursor: 'pointer', padding: 3, flexShrink: 0 }}
    >
      <Star size={14} fill={favorite ? 'currentColor' : 'none'} />
    </button>
  );
}

export function filterMonitoredRepos(repos: Repo[], ignoredRepoPaths: string[]) {
  const ignoredPaths = new Set(ignoredRepoPaths.map(normalizeRepoPath));
  return repos.filter(repo => !ignoredPaths.has(normalizeRepoPath(repo.path)));
}

function normalizeRepoPath(path: string) {
  return path.trim().replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

const repoRowStyle = { display: 'flex', alignItems: 'center', gap: 8, background: C.panel1, border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 10px' } as const;
const repoNameStyle = { color: C.textPrimary, fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 } as const;
const repoPathStyle = { color: C.textWeak, fontSize: 10, fontFamily: 'JetBrains Mono, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const } as const;
const metaChipStyle = { color: C.textWeak, fontSize: 10, background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 3, padding: '2px 6px', flexShrink: 0 } as const;
const mainTagStyle = { color: C.textSecondary, fontSize: 9, background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 3, padding: '0 4px', flexShrink: 0 } as const;
const groupCountStyle = { color: C.textWeak, fontSize: 10, fontWeight: 400 } as const;
const stopButtonStyle = { background: C.panel2, border: `1px solid ${C.border}`, color: C.textSecondary, borderRadius: 4, padding: '3px 6px', cursor: 'pointer', fontSize: 10, flexShrink: 0 } as const;
const groupContainerStyle = { background: C.panel1, border: `1px solid ${C.border}`, borderRadius: 6, overflow: 'hidden' } as const;
const groupHeaderStyle = { display: 'flex', alignItems: 'center', gap: 8, background: C.panel2, padding: '8px 10px' } as const;
const groupChildrenStyle = { display: 'flex', flexDirection: 'column' } as const;
const childRowStyle = { display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px 7px 26px', borderTop: `1px solid ${C.border}` } as const;
