import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Download, GitCommit, Layers3, MinusSquare, PlusSquare, RefreshCw, RotateCcw, Sparkles, TerminalSquare, Upload } from 'lucide-react';
import { formatComboSummary, getBuiltInCommandLabel } from './command-center';
import { createCommandConsoleSession } from './repo-command-console';
import type { AppSettings, BuiltInCommandAction, CommandCombo, CustomCommandButton, RepoCommandResult, RepoDetail, RepoMutationAction } from '../../domain/types';
import type { CommandConsoleState, PanelAction, PanelActionGroup, PanelCommandSection } from '../../components/ai-commit-panel';
import type { AppBackend } from '../../application/ports';

interface UseRepoCommandPanelArgs {
  repo: RepoDetail;
  settings: AppSettings;
  onRefresh: () => Promise<void>;
  onMutateRepo: (repoId: string, action: RepoMutationAction, body?: Record<string, unknown>) => Promise<void>;
  onRunCustomCommand: (repoPath: string, command: string, streamId?: string) => Promise<RepoCommandResult>;
  onOpenCommandsSettings: () => void;
  backend: Pick<AppBackend, 'generateCommitMessage' | 'onEvent'>;
}

export function useRepoCommandPanel({
  repo,
  settings,
  onRefresh,
  onMutateRepo,
  onRunCustomCommand,
  onOpenCommandsSettings,
  backend,
}: UseRepoCommandPanelArgs) {
  const [commitMessage, setCommitMessage] = useState('');
  const [stagedIds, setStagedIds] = useState<Set<string>>(new Set());
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [commandConsole, setCommandConsole] = useState<CommandConsoleState | null>(null);
  const scopeRef = useRef(0);
  const files = repo.files;

  useEffect(() => {
    setStagedIds(new Set(files.filter(file => file.staged).map(file => file.id)));
  }, [files, repo.id, repo.scannedAt]);

  useEffect(() => {
    scopeRef.current += 1;
    setBusyAction(null);
    setCommitMessage('');
    setAiError(null);
    setCommandConsole(null);
  }, [repo.id]);

  const repoActionBody = (body?: Record<string, unknown>) => ({
    ...(body ?? {}),
    repoPath: repo.path,
    repoCategory: repo.category,
  });
  const hasChanges = files.length > 0;
  const hasStaged = stagedIds.size > 0;
  const hasCommitMsg = commitMessage.trim().length > 0;
  const hasPull = repo.behind > 0;
  const hasPush = repo.ahead > 0;

  const createScopeGuard = () => {
    const scope = scopeRef.current;
    return () => scope === scopeRef.current;
  };

  const runBusyAction = async (actionKey: string, handler: (isActive: () => boolean) => Promise<void>) => {
    const isActive = createScopeGuard();
    if (isActive()) setBusyAction(actionKey);
    try {
      await handler(isActive);
    } finally {
      if (isActive()) setBusyAction(null);
    }
  };

  const triggerBusyAction = (actionKey: string, handler: (isActive: () => boolean) => Promise<void>) => {
    void runBusyAction(actionKey, handler)
      .catch(error => setAiError(error instanceof Error ? error.message : '操作失败'));
  };

  const executeBuiltInAction = async (
    action: BuiltInCommandAction,
    getMessage: () => string,
    setMessage: (message: string) => void,
    isActive: () => boolean,
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
      try {
        if (isActive()) setAiError(null);
        const nextMessage = await backend.generateCommitMessage(repo.id, settings);
        if (isActive()) setMessage(nextMessage);
        return nextMessage;
      } catch (error) {
        if (isActive()) setAiError(error instanceof Error ? error.message : 'AI 生成失败');
        throw error;
      }
    }
    if (action === 'commit') {
      const nextMessage = getMessage().trim();
      await onMutateRepo(repo.id, 'commit', repoActionBody({ message: nextMessage }));
      if (isActive()) setMessage('');
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
      const session = createCommandConsoleSession(
        setCommandConsole,
        combo.label,
        formatComboSummary(combo.actions),
        isActive,
      );
      let nextMessage = commitMessage;
      const getMessage = () => nextMessage;
      const setMessage = (value: string) => {
        if (!isActive()) return;
        nextMessage = value;
        setCommitMessage(value);
      };

      try {
        for (const action of combo.actions) {
          session.appendLine(`> ${getBuiltInCommandLabel(action)}`);
          const result = await executeBuiltInAction(action, getMessage, setMessage, isActive);
          if (result) session.appendLine(result);
        }
        session.finish('success');
      } catch (error) {
        session.appendLine(error instanceof Error ? error.message : '执行失败');
        session.finish('failed');
      }
    });
  };

  const runCustomCommand = (command: CustomCommandButton) => {
    triggerBusyAction(`custom:${command.id}`, async isActive => {
      const streamId = `cmd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const session = createCommandConsoleSession(setCommandConsole, command.label, command.command, isActive);
      const stopListening = backend.onEvent('repo-command-output', payload => {
        const event = readRuntimePayload(payload);
        if (event?.streamId !== streamId) return;
        session.write(typeof event.chunk === 'string' ? event.chunk : '');
      });

      try {
        const result = await onRunCustomCommand(repo.path, command.command, streamId);
        if (result.output) session.write(result.output);
        session.appendLine(result.exitCode === 0 ? '[exit 0]' : `[exit ${result.exitCode}]`);
        let refreshFailed = false;
        await onRefresh().catch(error => {
          refreshFailed = true;
          session.appendLine(error instanceof Error ? error.message : '刷新失败');
        });
        session.finish(result.exitCode === 0 && !refreshFailed ? 'success' : 'failed');
      } catch (error) {
        session.appendLine(error instanceof Error ? error.message : '执行失败');
        session.finish('failed');
      } finally {
        stopListening();
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
      await executeBuiltInAction(action, () => commitMessage, setCommitMessage, isActive);
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
        buildBuiltinAction('stage-all', '全部暂存', <PlusSquare size={12} />, 'stage-all', busyAction !== null || !hasChanges || stagedIds.size === files.length),
        buildBuiltinAction('unstage-all', '全部取消暂存', <MinusSquare size={12} />, 'unstage-all', busyAction !== null || stagedIds.size === 0),
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
        icon: <Layers3 size={12} />,
        onClick: () => runCombo(combo),
        disabled: busyAction !== null,
        accent: true,
      })),
      onManage: onOpenCommandsSettings,
    },
    {
      key: 'custom',
      label: '命令',
      actions: settings.commandCenter.customCommands.map(command => ({
        key: command.id,
        label: busyAction === `custom:${command.id}` ? `${command.label || '命令'}…` : command.label || '命令',
        icon: <TerminalSquare size={12} />,
        onClick: () => runCustomCommand(command),
        disabled: busyAction !== null,
      })),
      onManage: onOpenCommandsSettings,
    },
  ];

  return {
    stagedIds,
    commitMessage,
    aiError,
    topAction,
    actionGroups,
    commandSections,
    commandConsole,
    setCommitMessage,
    clearCommandConsole: () => setCommandConsole(null),
  };
}

function readRuntimePayload(payload: unknown) {
  return payload && typeof payload === 'object' ? payload as Record<string, unknown> : null;
}
