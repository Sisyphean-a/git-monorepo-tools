import { CheckCircle2, Loader2 } from 'lucide-react';
import { shouldShowCleanIndicator } from '../domain/repo-status';
import { C } from '../theme';
import type { Repo } from '../domain/types';
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
      {repo.remoteCheck?.status === 'error' && <span title={`远端检查失败于 ${repo.remoteCheck.checkedAt}\n${repo.remoteCheck.error ?? ''}`}><StatusPill color={C.conflict}>远端失败</StatusPill></span>}
      {repo.remote !== '—' && !repo.remoteCheck && <span title="尚未检查远端，提交数来自本地记录"><StatusPill color={C.textWeak}>远端未知</StatusPill></span>}
      {repo.conflicts > 0 && <StatusPill color={C.conflict}>⚠</StatusPill>}
      {repo.modified > 0 && <StatusPill color={C.modified}>M {repo.modified}</StatusPill>}
      {repo.ahead > 0 && <StatusPill color={C.needPush}>↑{repo.ahead}</StatusPill>}
      {repo.behind > 0 && <StatusPill color={C.needPull}>↓{repo.behind}</StatusPill>}
      {shouldShowCleanIndicator(repo) && <CheckCircle2 size={11} color={C.clean} aria-label={repo.remote === '—' ? '本地干净，无远端跟踪分支' : '本地干净，最近一次远端检查无待同步提交'} />}
    </div>
  );
}
