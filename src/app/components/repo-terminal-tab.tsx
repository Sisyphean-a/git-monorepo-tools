import { useEffect, useMemo, useRef, useState } from 'react';
import { C } from '../theme';
import type { RepoDetail } from '../domain/types';
import { RepoTerminalSurface } from './repo-terminal-surface';

interface RepoTerminalTabProps {
  repoDetails: Record<string, RepoDetail>;
  activeRepoId: string;
  visible: boolean;
}

interface IndependentTerminalTabProps {
  repo: RepoDetail;
  visible: boolean;
}

const EMPTY_INACTIVE_TERMINAL_CLOSE_DELAY_MS = 60_000;

export function IndependentTerminalTab({ repo, visible }: IndependentTerminalTabProps) {
  return <RepoTerminalSurface repo={repo} active={visible} createIndependentSession />;
}

export function RepoTerminalTab({ repoDetails, activeRepoId, visible }: RepoTerminalTabProps) {
  const [openedRepoIds, setOpenedRepoIds] = useState<string[]>([]);
  const [contentfulRepoIds, setContentfulRepoIds] = useState<ReadonlySet<string>>(() => new Set());
  const [autoClosingRepoIds, setAutoClosingRepoIds] = useState<ReadonlySet<string>>(() => new Set());
  const contentfulRepoIdsRef = useRef(contentfulRepoIds);

  useEffect(() => {
    contentfulRepoIdsRef.current = contentfulRepoIds;
  }, [contentfulRepoIds]);

  useEffect(() => {
    setOpenedRepoIds(current => current.filter(repoId => Boolean(repoDetails[repoId])));
    setContentfulRepoIds(current => new Set([...current].filter(repoId => Boolean(repoDetails[repoId]))));
    setAutoClosingRepoIds(current => new Set([...current].filter(repoId => Boolean(repoDetails[repoId]))));
  }, [repoDetails]);

  useEffect(() => {
    const timers = openedRepoIds
      .filter(repoId => repoId !== activeRepoId && !contentfulRepoIds.has(repoId) && !autoClosingRepoIds.has(repoId))
      .map(repoId => window.setTimeout(() => {
        if (contentfulRepoIdsRef.current.has(repoId)) {
          return;
        }
        setAutoClosingRepoIds(current => {
          if (current.has(repoId)) {
            return current;
          }
          return new Set(current).add(repoId);
        });
      }, EMPTY_INACTIVE_TERMINAL_CLOSE_DELAY_MS));

    return () => timers.forEach(timer => window.clearTimeout(timer));
  }, [activeRepoId, autoClosingRepoIds, contentfulRepoIds, openedRepoIds]);

  const handleContentChange = (repoId: string, hasContent: boolean) => {
    setContentfulRepoIds(current => {
      if (current.has(repoId) === hasContent) {
        return current;
      }
      const next = new Set(current);
      if (hasContent) {
        next.add(repoId);
      } else {
        next.delete(repoId);
      }
      return next;
    });
  };

  const handleTerminalClosed = (repoId: string) => {
    setOpenedRepoIds(current => current.filter(id => id !== repoId));
    setContentfulRepoIds(current => {
      if (!current.has(repoId)) {
        return current;
      }
      const next = new Set(current);
      next.delete(repoId);
      return next;
    });
    setAutoClosingRepoIds(current => {
      if (!current.has(repoId)) {
        return current;
      }
      const next = new Set(current);
      next.delete(repoId);
      return next;
    });
  };

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
          closeRequested={autoClosingRepoIds.has(repo.id)}
          onContentChange={hasContent => handleContentChange(repo.id, hasContent)}
          onClosed={() => handleTerminalClosed(repo.id)}
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
