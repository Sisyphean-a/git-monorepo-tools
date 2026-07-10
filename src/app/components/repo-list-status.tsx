import { CheckCircle2, Loader2 } from 'lucide-react';
import { shouldShowCleanIndicator } from '../repo-status';
import { C } from '../theme';
import type { Repo } from '../types';
import { StatusPill } from './common';

export function RepoListStatus({ repo }: { repo: Repo }) {
  if (repo.status === 'checking') {
    return (
      <div style={{ display: 'flex', minWidth: 16, justifyContent: 'flex-end', alignItems: 'center' }}>
        <Loader2 size={12} color={C.textSecondary} style={{ animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 3, flexShrink: 0, alignItems: 'center' }}>
      {repo.status === 'error' && <StatusPill color={C.conflict}>ERR</StatusPill>}
      {repo.conflicts > 0 && <StatusPill color={C.conflict}>⚠</StatusPill>}
      {repo.modified > 0 && <StatusPill color={C.modified}>M {repo.modified}</StatusPill>}
      {repo.ahead > 0 && <StatusPill color={C.needPush}>↑{repo.ahead}</StatusPill>}
      {repo.behind > 0 && <StatusPill color={C.needPull}>↓{repo.behind}</StatusPill>}
      {shouldShowCleanIndicator(repo) && <CheckCircle2 size={11} color={C.clean} />}
    </div>
  );
}
