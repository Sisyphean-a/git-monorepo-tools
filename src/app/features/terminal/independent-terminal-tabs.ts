export type IndependentTerminalTabId = `terminal-${number}`;

export type WorkspaceMainTab = 'changes' | 'history' | 'terminal' | IndependentTerminalTabId;

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
  mainTab: WorkspaceMainTab,
  repoId: string,
  terminals: readonly IndependentTerminalTab[],
): WorkspaceMainTab {
  if (!mainTab.startsWith('terminal-')) {
    return mainTab;
  }

  const terminal = terminals.find(item => item.id === mainTab);
  if (!terminal) {
    return 'changes';
  }
  return terminal.repoId === repoId ? mainTab : 'terminal';
}
