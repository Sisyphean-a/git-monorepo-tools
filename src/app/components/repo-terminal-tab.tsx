import { useEffect, useMemo, useState } from 'react';
import { C } from '../theme';
import type { RepoDetail } from '../domain/types';
import { RepoTerminalSurface } from './repo-terminal-surface';

interface RepoTerminalTabProps {
  repoDetails: Record<string, RepoDetail>;
  activeRepoId: string;
  visible: boolean;
}

export function RepoTerminalTab({ repoDetails, activeRepoId, visible }: RepoTerminalTabProps) {
  const [openedRepoIds, setOpenedRepoIds] = useState<string[]>([]);

  useEffect(() => {
    setOpenedRepoIds(current => current.filter(repoId => Boolean(repoDetails[repoId])));
  }, [repoDetails]);

  useEffect(() => {
    if (!visible || !repoDetails[activeRepoId]) return;
    setOpenedRepoIds(current => current.includes(activeRepoId) ? current : [...current, activeRepoId]);
  }, [activeRepoId, repoDetails, visible]);

  const openedRepos = useMemo(
    () => openedRepoIds.map(repoId => repoDetails[repoId]).filter((repo): repo is RepoDetail => Boolean(repo)),
    [openedRepoIds, repoDetails],
  );

  const isBooting = visible && !!repoDetails[activeRepoId] && !openedRepoIds.includes(activeRepoId);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        visibility: visible ? 'visible' : 'hidden',
        pointerEvents: visible ? 'auto' : 'none',
        background: C.appBg,
      }}
    >
      {openedRepos.map(repo => (
        <RepoTerminalSurface
          key={repo.id}
          repo={repo}
          active={visible && repo.id === activeRepoId}
        />
      ))}
      {isBooting && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textWeak, fontSize: 12 }}>
          正在启动终端...
        </div>
      )}
    </div>
  );
}
