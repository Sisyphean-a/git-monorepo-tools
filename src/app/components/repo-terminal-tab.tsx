import { useEffect, useMemo, useState } from 'react';
import { C } from '../theme';
import type { RepoDetail } from '../domain/types';
import { RepoTerminalSurface } from './repo-terminal-surface';
import { collectEmptyTerminalClosures, retainExistingRepoIds, retainExistingRepoIdSet } from '../features/terminal/terminal-repo-state';

interface RepoTerminalTabProps {
  repoDetails: Record<string, RepoDetail>;
  activeRepoId: string;
  visible: boolean;
  rightClickCopyPaste: boolean;
  onError: (error: unknown, fallback: string) => void;
}

interface IndependentTerminalTabProps {
  repo: RepoDetail;
  visible: boolean;
  rightClickCopyPaste: boolean;
  onError: (error: unknown, fallback: string) => void;
}

export function IndependentTerminalTab({ repo, visible, rightClickCopyPaste, onError }: IndependentTerminalTabProps) {
  return <RepoTerminalSurface repo={repo} active={visible} rightClickCopyPaste={rightClickCopyPaste} createIndependentSession onClosed={error => {
    if (error !== undefined) onError(error, `关闭独立终端失败：${repo.name}`);
  }} />;
}

export function RepoTerminalTab({ repoDetails, activeRepoId, visible, rightClickCopyPaste, onError }: RepoTerminalTabProps) {
  const [openedRepoIds, setOpenedRepoIds] = useState<string[]>([]);
  const [contentfulRepoIds, setContentfulRepoIds] = useState<ReadonlySet<string>>(() => new Set());
  const [autoClosingRepoIds, setAutoClosingRepoIds] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    setOpenedRepoIds(current => retainExistingRepoIds(current, repoDetails));
    setContentfulRepoIds(current => retainExistingRepoIdSet(current, repoDetails));
    setAutoClosingRepoIds(current => retainExistingRepoIdSet(current, repoDetails));
  }, [repoDetails]);

  useEffect(() => {
    setAutoClosingRepoIds(current => collectEmptyTerminalClosures(openedRepoIds, activeRepoId, visible, contentfulRepoIds, current));
  }, [activeRepoId, contentfulRepoIds, openedRepoIds, visible]);

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

  const handleTerminalClosed = (repoId: string, closeError?: unknown) => {
    if (closeError !== undefined) onError(closeError, `自动关闭空终端失败：${repoDetails[repoId]?.name ?? repoId}`);
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
    if (!visible || !repoDetails[activeRepoId] || autoClosingRepoIds.has(activeRepoId)) return;
    setOpenedRepoIds(current => current.includes(activeRepoId) ? current : [...current, activeRepoId]);
  }, [activeRepoId, autoClosingRepoIds, openedRepoIds, repoDetails, visible]);

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
          rightClickCopyPaste={rightClickCopyPaste}
          closeRequested={autoClosingRepoIds.has(repo.id)}
          onContentChange={hasContent => handleContentChange(repo.id, hasContent)}
          onClosed={error => handleTerminalClosed(repo.id, error)}
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
