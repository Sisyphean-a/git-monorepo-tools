export type IndependentTerminalTabId = `terminal-${number}`;

export type WorkspaceMainTab = 'changes' | 'history' | 'terminal' | IndependentTerminalTabId;

export type WorkspaceMainTabsByRepo = Readonly<Record<string, WorkspaceMainTab>>;

export interface IndependentTerminalTab {
  id: IndependentTerminalTabId;
  repoId: string;
}

export function getIndependentTerminalsForRepo(
  terminals: readonly IndependentTerminalTab[],
  repoId: string,
): IndependentTerminalTab[] {
  return terminals.filter(terminal => terminal.repoId === repoId);
}

export function resolveMainTabForRepo(
  mainTabsByRepo: WorkspaceMainTabsByRepo,
  repoId: string,
  terminals: readonly IndependentTerminalTab[],
): WorkspaceMainTab {
  const mainTab = mainTabsByRepo[repoId] ?? 'changes';
  if (!mainTab.startsWith('terminal-')) {
    return mainTab;
  }

  const terminal = terminals.find(item => item.id === mainTab);
  if (!terminal) {
    return 'changes';
  }
  return terminal.repoId === repoId ? mainTab : 'terminal';
}

export function selectMainTabForRepo(
  mainTabsByRepo: WorkspaceMainTabsByRepo,
  repoId: string,
  mainTab: WorkspaceMainTab,
): WorkspaceMainTabsByRepo {
  if (mainTabsByRepo[repoId] === mainTab) {
    return mainTabsByRepo;
  }
  return { ...mainTabsByRepo, [repoId]: mainTab };
}
