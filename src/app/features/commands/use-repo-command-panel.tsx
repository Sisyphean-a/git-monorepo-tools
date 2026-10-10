import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Download, GitCommit, MinusSquare, PlusSquare, RefreshCw, RotateCcw, Sparkles, Upload } from 'lucide-react';
import { formatComboSummary, getBuiltInCommandLabel, getRepoCommands } from './command-catalog';
import { createComboCommitMessageState } from './combo-commit-message-state';
import { createCommandTerminators } from './command-terminators';
import { createCommandConsoleSession, pruneCommandConsoles, type CommandConsoleUpdater } from './repo-command-console';
import type { AppSettings, BuiltInCommandAction, CommandCombo, CustomCommandButton, RepoCommandResult, RepoDetail, RepoMutationAction } from '../../domain/types';
import type { PanelAction, PanelActionGroup, PanelCommandSection } from '../../components/ai-commit-panel';
import type { CommandConsoleState } from './command-console-state';
import type { AppBackend } from '../../application/ports';
import { describeRepoActionError, type RepoActionFailure } from '../../application/repo-action-error';

interface UseRepoCommandPanelArgs {
  repo: RepoDetail;
  repoIds: readonly string[];
  settings: AppSettings;
  onRefresh: () => Promise<void>;
  onMutateRepo: (repoId: string, action: RepoMutationAction, body?: Record<string, unknown>) => Promise<void>;
  onRunCustomCommand: (repoPath: string, command: string, streamId?: string) => Promise<RepoCommandResult>;
  onOpenCommands: () => void;
  backend: Pick<AppBackend, 'generateCommitMessage' | 'onEvent' | 'stopRepoCommand'>;
}

export async function runRepoPanelAction(
  actionKey: string,
  handler: (isActive: () => boolean) => Promise<void>,
  feedback: {
    repo: Pick<RepoDetail, 'name' | 'path'>;
    isActive: () => boolean;
    setBusyAction: (action: string | null) => void;
    setError: (error: RepoActionFailure | null) => void;
  },
) {
  feedback.setBusyAction(actionKey);
  feedback.setError(null);
  try {
    await handler(feedback.isActive);
  } catch (error) {
    // Effect: 错误和忙碌态均写回发起仓库，切换不会让旧操作覆盖新仓库或允许同仓库重入。
    feedback.setError(describeRepoActionError(actionKey, error, feedback.repo));
  } finally {
    feedback.setBusyAction(null);
  }
}

export function useRepoCommandPanel({
  repo,
  repoIds,
  settings,
  onRefresh,
  onMutateRepo,
  onRunCustomCommand,
  onOpenCommands,
  backend,
}: UseRepoCommandPanelArgs) {
  const [commitMessage, setCommitMessage] = useState('');
  const [busyActions, setBusyActions] = useState<Record<string, string | null>>({});
  const busyAction = busyActions[repo.id] ?? null;
  const setBusyAction = (action: string | null) => {
    if (!repoIdsRef.current.includes(repo.id)) return;
    setBusyActions(current => ({ ...current, [repo.id]: action }));
  };
  const [actionErrors, setActionErrors] = useState<Record<string, RepoActionFailure | null>>({});
  const repoIdsRef = useRef(repoIds);
  repoIdsRef.current = repoIds;
  const setAiError = (error: RepoActionFailure | null) => {
    if (!repoIdsRef.current.includes(repo.id)) return;
    setActionErrors(current => ({ ...current, [repo.id]: error }));
  };
  // Rule: 命令输出按仓库隔离存储，每个项目有独立的输出区域；切换项目时各自保留，互不覆盖。
  const [commandConsoles, setCommandConsoles] = useState<Record<string, CommandConsoleState | null>>({});
  const scopeRef = useRef(0);
  // Rule: 每个仓库同一时刻至多有一个可终止的运行中会话；会话结束必须清除，避免终止打到已完成的命令。
  const [terminators] = useState(createCommandTerminators);
  const files = repo.files;
  const stagedCount = files.reduce((count, file) => count + Number(file.staged), 0);

  // 定向更新某个仓库的输出槽位；同一仓库内由会话自身的 sessionId 守卫，跨仓库互不影响。
  const updateRepoConsole = (repoId: string) => (updater: CommandConsoleUpdater) => {
    setCommandConsoles(current => ({ ...current, [repoId]: updater(current[repoId] ?? null) }));
  };

  useEffect(() => {
    scopeRef.current += 1;
    setCommitMessage('');
    // Rule: 命令输出和操作错误归属发起仓库；切换项目不得清除，切回后仍可查阅。
  }, [repo.id]);

  useEffect(() => {
    setCommandConsoles(current => pruneCommandConsoles(current, repoIds));
    setActionErrors(current => {
      const entries = Object.entries(current).filter(([id]) => repoIds.includes(id));
      return entries.length === Object.keys(current).length ? current : Object.fromEntries(entries);
    });
    setBusyActions(current => {
      const entries = Object.entries(current).filter(([id]) => repoIds.includes(id));
      return entries.length === Object.keys(current).length ? current : Object.fromEntries(entries);
    });
  }, [repoIds]);

  const repoActionBody = (body?: Record<string, unknown>) => ({
    ...(body ?? {}),
    repoPath: repo.path,
    repoCategory: repo.category,
  });
  const hasChanges = files.length > 0;
  const hasStaged = stagedCount > 0;
  const hasCommitMsg = commitMessage.trim().length > 0;
  const hasPull = repo.behind > 0;
  const hasPush = repo.ahead > 0;

  const createScopeGuard = () => {
    const scope = scopeRef.current;
    return () => scope === scopeRef.current;
  };

  const runBusyAction = (actionKey: string, handler: (isActive: () => boolean) => Promise<void>) => runRepoPanelAction(
    actionKey, handler,
    { repo, isActive: createScopeGuard(), setBusyAction, setError: setAiError },
  );

  const triggerBusyAction = (actionKey: string, handler: (isActive: () => boolean) => Promise<void>) => {
    void runBusyAction(actionKey, handler);
  };

  const executeBuiltInAction = async (
    action: BuiltInCommandAction,
    getMessage: () => string,
    setMessage: (message: string) => void,
  ) => {
    if (action === 'stage-all') {
      await onMutateRepo(repo.id, 'stage-all', repoActionBody());
      return '已完成';
    }
    if (action === 'unstage-all') {
      await onMutateRepo(repo.id, 'unstage-all', repoActionBody());
      return '已完成';
    }
    if (action === 'generate') {
      const nextMessage = await backend.generateCommitMessage(repo.id, settings);
      setMessage(nextMessage);
      return nextMessage;
    }
    if (action === 'commit') {
      const nextMessage = getMessage().trim();
      await onMutateRepo(repo.id, 'commit', repoActionBody({ message: nextMessage }));
      setMessage('');
      return nextMessage ? `已提交：${nextMessage}` : '已提交';
    }
    if (action === 'pull') {
      await onMutateRepo(repo.id, 'pull', repoActionBody());
      return '已完成';
    }
    if (action === 'push') {
      await onMutateRepo(repo.id, 'push', repoActionBody());
      return '已完成';
    }
    await onRefresh();
    return '已刷新';
  };

  const runCombo = (combo: CommandCombo) => {
    triggerBusyAction(`combo:${combo.id}`, async isActive => {
      let cancelled = false;
      terminators.register(repo.id, () => {
        cancelled = true;
        return Promise.resolve();
      });
      const session = createCommandConsoleSession(
        updateRepoConsole(repo.id),
        combo.label,
        formatComboSummary(combo.actions),
      );
      const comboMessage = createComboCommitMessageState(commitMessage, value => {
        if (isActive()) setCommitMessage(value);
      });

      let currentAction: BuiltInCommandAction | undefined;
      try {
        for (const action of combo.actions) {
          currentAction = action;
          if (cancelled) {
            session.appendLine('已终止：剩余步骤未执行');
            session.finish('failed');
            return;
          }
          session.appendLine(`> ${getBuiltInCommandLabel(action)}`);
          const result = await executeBuiltInAction(
            action,
            comboMessage.getMessage,
            comboMessage.setMessage,
          );
          if (result) session.appendLine(result);
        }
        session.finish('success');
      } catch (error) {
        const failure = describeRepoActionError(currentAction ?? combo.label, error, repo);
        session.appendLine(`${failure.title}\n${failure.reason}\n${failure.suggestion}\n${failure.detail}`);
        setAiError(failure);
        session.finish('failed');
      } finally {
        terminators.clear(repo.id);
      }
    });
  };

  const runCustomCommand = (scope: 'global' | 'project', command: CustomCommandButton) => {
    triggerBusyAction(`${scope}-command:${command.id}`, async () => {
      const streamId = `cmd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const session = createCommandConsoleSession(updateRepoConsole(repo.id), command.label, command.command);
      let terminateRequested = false;
      terminators.register(repo.id, () => {
        terminateRequested = true;
        return backend.stopRepoCommand(streamId).catch(error => {
          // Failure: 命令可能在点击瞬间已结束；恢复可重试状态并显式提示，而不是停在“终止中…”。
          terminateRequested = false;
          setAiError(describeRepoActionError('terminate', error, repo));
          throw error;
        });
      });
      const stopListening = backend.onEvent('repo-command-output', payload => {
        const event = readRuntimePayload(payload);
        if (event?.streamId !== streamId) return;
        session.write(typeof event.chunk === 'string' ? event.chunk : '');
      });

      try {
        const result = await onRunCustomCommand(repo.path, command.command, streamId);
        if (result.output) session.write(result.output);
        if (terminateRequested) {
          session.appendLine('已终止');
          session.finish('failed');
          return;
        }
        session.appendLine(result.exitCode === 0 ? '[exit 0]' : `[exit ${result.exitCode}]`);
        let refreshFailed = false;
        await onRefresh().catch(error => {
          refreshFailed = true;
          const failure = describeRepoActionError('refresh', error, repo);
          session.appendLine(`${failure.title}\n${failure.reason}\n${failure.suggestion}\n${failure.detail}`);
          setAiError(failure);
        });
        session.finish(result.exitCode === 0 && !refreshFailed ? 'success' : 'failed');
      } catch (error) {
        const failure = describeRepoActionError(command.label || '自定义命令', error, repo);
        session.appendLine(`${failure.title}\n${failure.reason}\n${failure.suggestion}\n${failure.detail}`);
        setAiError(failure);
        session.finish('failed');
      } finally {
        stopListening();
        terminators.clear(repo.id);
      }
    });
  };

  const handleDiscardAll = () => {
    const confirmed = window.confirm('这会放弃当前仓库的全部本地改动，包括已暂存、未暂存和未跟踪文件，且无法恢复。确认继续？');
    if (!confirmed) return;
    triggerBusyAction('discard-all', async isActive => {
      await onMutateRepo(repo.id, 'discard-all', repoActionBody());
      if (isActive()) {
        setCommitMessage('');
        setAiError(null);
      }
    });
  };

  const buildBuiltinAction = (
    key: string,
    label: string,
    icon: ReactNode,
    action: BuiltInCommandAction,
    disabled: boolean,
    extras: Partial<PanelAction> = {},
  ): PanelAction => ({
    key,
    label,
    icon,
    onClick: () => triggerBusyAction(key, async isActive => {
      await executeBuiltInAction(action, () => commitMessage, value => {
        if (isActive()) setCommitMessage(value);
      });
    }),
    disabled,
    ...extras,
  });

  const topAction: PanelAction = {
    key: 'discard-all',
    label: busyAction === 'discard-all' ? '放弃中…' : '放弃更改',
    icon: <RotateCcw size={12} />,
    onClick: handleDiscardAll,
    disabled: busyAction !== null || !hasChanges,
    warning: true,
  };

  const actionGroups: PanelActionGroup[] = [
    {
      key: 'stage',
      actions: [
        buildBuiltinAction('stage-all', '全部暂存', <PlusSquare size={12} />, 'stage-all', busyAction !== null || !hasChanges || stagedCount === files.length),
        buildBuiltinAction('unstage-all', '全部取消暂存', <MinusSquare size={12} />, 'unstage-all', busyAction !== null || stagedCount === 0),
      ],
    },
    {
      key: 'commit',
      actions: [
        buildBuiltinAction('generate', busyAction === 'generate' ? '生成中…' : '生成', <Sparkles size={12} />, 'generate', busyAction !== null || !hasStaged, { accent: true }),
        buildBuiltinAction('commit', busyAction === 'commit' ? '提交中…' : '提交', <GitCommit size={12} />, 'commit', busyAction !== null || !hasStaged || !hasCommitMsg, { primary: true }),
      ],
    },
    {
      key: 'sync',
      actions: [
        buildBuiltinAction('pull', busyAction === 'pull' ? 'Pull 中…' : 'Pull', <Download size={12} />, 'pull', busyAction !== null, { warning: hasPull && repo.modified > 0 }),
        buildBuiltinAction('push', busyAction === 'push' ? 'Push 中…' : 'Push', <Upload size={12} />, 'push', busyAction !== null, { dimmed: !hasPush }),
        buildBuiltinAction('refresh', '刷新', <RefreshCw size={11} />, 'refresh', busyAction !== null),
      ],
    },
  ];

  const commandSections: PanelCommandSection[] = [
    {
      key: 'combo',
      label: '组合',
      actions: settings.commandCenter.combos.map(combo => ({
        key: combo.id,
        label: busyAction === `combo:${combo.id}` ? `${combo.label}…` : combo.label,
        onClick: () => runCombo(combo),
        disabled: busyAction !== null,
        accent: true,
      })),
      onManage: onOpenCommands,
    },
    {
      key: 'command',
      label: '命令',
      actions: [
        ...getRepoCommands(settings.commandCenter, repo.id).map(({ scope, command }) => ({
          key: `${scope}:${command.id}`,
          label: busyAction === `${scope}-command:${command.id}` ? `${command.label || '命令'}…` : command.label || '命令',
          onClick: () => runCustomCommand(scope, command),
          disabled: busyAction !== null,
        })),
      ],
      onManage: onOpenCommands,
    },
  ];

  return {
    stagedCount,
    commitMessage,
    aiError: actionErrors[repo.id] ?? null,
    topAction,
    actionGroups,
    commandSections,
    commandConsole: commandConsoles[repo.id] ?? null,
    setCommitMessage,
    clearCommandConsole: () => updateRepoConsole(repo.id)(() => null),
    terminateCommandConsole: () => terminators.terminate(repo.id),
  };
}

function readRuntimePayload(payload: unknown) {
  return payload && typeof payload === 'object' ? payload as Record<string, unknown> : null;
}
