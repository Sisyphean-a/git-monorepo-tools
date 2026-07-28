import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { RepoInteractionBackend, RuntimeBackend, TerminalSessionRequest } from '../../application/ports.js';
import type { RepoDetail, TerminalSessionInfo } from '../../domain/types.js';

export type RepoTerminalState = 'idle' | 'starting' | 'running' | 'active' | 'exited' | 'failed';
export type WorkspaceMainTab = 'changes' | 'history' | 'terminal' | IndependentTerminalTabId;
export type IndependentTerminalTabId = `terminal-${number}`;
export type WorkspaceMainTabsByRepo = Readonly<Record<string, WorkspaceMainTab>>;

export interface IndependentTerminalTab {
  id: IndependentTerminalTabId;
  repoId: string;
}

export type TerminalRuntime = Pick<
  RepoInteractionBackend,
  | 'ensureTerminalSession'
  | 'createTerminalSession'
  | 'restartTerminalSession'
  | 'closeTerminalSession'
  | 'writeTerminalInput'
  | 'resizeTerminal'
> & Pick<RuntimeBackend, 'onEvent' | 'readClipboardImagePath' | 'readClipboardText'>;

type TerminalStatusSnapshot = Readonly<Record<string, RepoTerminalState>>;
type TerminalOutputHandler = (chunk: string) => void;
type TerminalExitHandler = (exitCode: number) => void;

type TerminalSessionEntry = {
  repoId: string;
  sessionId: string | null;
  state: RepoTerminalState;
  lastOutputAt: number | null;
};

type TerminalSessionSubscriber = {
  sessionId: string | null;
  onOutput: TerminalOutputHandler;
  onExit: TerminalExitHandler;
};

export interface TerminalSessionSubscription {
  bindSession(sessionId: string): void;
  dispose(): void;
}

const ACTIVE_WINDOW_MS = 1400;
const TERMINAL_OUTPUT_EVENT = 'repo-terminal-output';
const TERMINAL_EXIT_EVENT = 'repo-terminal-exit';

/**
 * Flow: owns terminal session lifecycle and runtime events; callers only request work or subscribe.
 * Guarantee: every runtime error from starting or restarting marks its repository as failed before it propagates.
 */
export class TerminalWorkspace {
  private readonly listeners = new Set<() => void>();
  private readonly entries = new Map<string, TerminalSessionEntry>();
  private readonly pendingEntries = new Map<string, RepoTerminalState>();
  private readonly subscribers = new Set<TerminalSessionSubscriber>();
  private snapshot: TerminalStatusSnapshot = {};
  private outputStop: (() => void) | null;
  private exitStop: (() => void) | null;
  private decayTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly runtime: TerminalRuntime) {
    this.outputStop = runtime.onEvent(TERMINAL_OUTPUT_EVENT, (payload: unknown) => this.handleOutput(payload));
    this.exitStop = runtime.onEvent(TERMINAL_EXIT_EVENT, (payload: unknown) => this.handleExit(payload));
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;

  async ensureSession(request: TerminalSessionRequest) {
    return this.startSession(request, this.runtime.ensureTerminalSession);
  }

  async createSession(request: TerminalSessionRequest) {
    return this.startSession(request, this.runtime.createTerminalSession);
  }

  async restartSession(repoId: string, sessionId: string, cols: number, rows: number) {
    this.markStarting(repoId);
    try {
      const session = await this.runtime.restartTerminalSession(sessionId, cols, rows);
      this.registerSession(session);
      return session;
    } catch (error) {
      this.markFailed(repoId);
      throw error;
    }
  }

  async sendToDefaultSession(request: TerminalSessionRequest, data: string) {
    this.markStarting(request.repoId);
    try {
      const session = await this.runtime.ensureTerminalSession(request);
      this.registerSession(session);
      await this.runtime.writeTerminalInput(session.sessionId, data);
      return session;
    } catch (error) {
      this.markFailed(request.repoId);
      throw error;
    }
  }

  closeSession(sessionId: string) {
    return this.runtime.closeTerminalSession(sessionId);
  }

  writeInput(sessionId: string, data: string) {
    return this.runtime.writeTerminalInput(sessionId, data);
  }

  resize(sessionId: string, cols: number, rows: number) {
    return this.runtime.resizeTerminal(sessionId, cols, rows);
  }

  readClipboardImagePath = () => this.runtime.readClipboardImagePath();

  readClipboardText = () => this.runtime.readClipboardText();

  createSurfaceSession(createIndependentSession: boolean) {
    return new TerminalSurfaceSession(this, createIndependentSession);
  }

  subscribeSession(onOutput: TerminalOutputHandler, onExit: TerminalExitHandler): TerminalSessionSubscription {
    const subscriber: TerminalSessionSubscriber = { sessionId: null, onOutput, onExit };
    this.subscribers.add(subscriber);
    return {
      bindSession: sessionId => {
        subscriber.sessionId = sessionId;
      },
      dispose: () => {
        this.subscribers.delete(subscriber);
      },
    };
  }

  dispose() {
    this.outputStop?.();
    this.exitStop?.();
    this.outputStop = null;
    this.exitStop = null;
    if (this.decayTimer !== null) {
      clearTimeout(this.decayTimer);
      this.decayTimer = null;
    }
    this.listeners.clear();
    this.subscribers.clear();
  }

  private async startSession(
    request: TerminalSessionRequest,
    start: (request: TerminalSessionRequest) => Promise<TerminalSessionInfo>,
  ) {
    this.markStarting(request.repoId);
    try {
      const session = await start(request);
      this.registerSession(session);
      return session;
    } catch (error) {
      this.markFailed(request.repoId);
      throw error;
    }
  }

  private registerSession(session: TerminalSessionInfo) {
    if (!session.repoId || !session.sessionId) {
      return;
    }
    this.pendingEntries.delete(session.repoId);
    const current = this.entries.get(session.sessionId);
    this.entries.set(session.sessionId, {
      repoId: session.repoId,
      sessionId: session.sessionId,
      state: current?.state === 'active' ? 'active' : 'running',
      lastOutputAt: current?.lastOutputAt ?? null,
    });
    this.publishSnapshot();
  }

  private markStarting(repoId: string) {
    this.pendingEntries.set(repoId, 'starting');
    this.publishSnapshot();
  }

  private markFailed(repoId: string) {
    this.pendingEntries.set(repoId, 'failed');
    this.publishSnapshot();
  }

  private handleOutput(payload: unknown) {
    const event = readTerminalEvent(payload);
    if (!event?.sessionId || !event.chunk) {
      return;
    }

    const current = this.entries.get(event.sessionId);
    if (current) {
      const wasActive = current.state === 'active';
      this.entries.set(event.sessionId, {
        repoId: current.repoId,
        sessionId: event.sessionId,
        state: 'active',
        lastOutputAt: Date.now(),
      });
      if (wasActive) {
        this.scheduleDecay();
      } else {
        this.publishSnapshot();
      }
    }

    for (const subscriber of this.subscribers) {
      if (subscriber.sessionId === event.sessionId) {
        subscriber.onOutput(event.chunk);
      }
    }
  }

  private handleExit(payload: unknown) {
    const event = readTerminalEvent(payload);
    if (!event?.sessionId) {
      return;
    }

    const current = this.entries.get(event.sessionId);
    if (current) {
      this.entries.set(event.sessionId, {
        repoId: current.repoId,
        sessionId: null,
        state: 'exited',
        lastOutputAt: null,
      });
      this.publishSnapshot();
    }

    for (const subscriber of this.subscribers) {
      if (subscriber.sessionId === event.sessionId) {
        subscriber.onExit(event.exitCode ?? -1);
      }
    }
  }

  private publishSnapshot() {
    const states = new Map<string, RepoTerminalState>();
    for (const entry of this.entries.values()) {
      setRepoState(states, entry.repoId, entry.state);
    }
    for (const [repoId, state] of this.pendingEntries) {
      setRepoState(states, repoId, state);
    }
    this.snapshot = Object.freeze(Object.fromEntries(states));
    this.scheduleDecay();
    this.listeners.forEach(listener => listener());
  }

  private scheduleDecay() {
    if (this.decayTimer !== null) {
      clearTimeout(this.decayTimer);
      this.decayTimer = null;
    }

    const now = Date.now();
    let nextDelay: number | null = null;
    for (const entry of this.entries.values()) {
      if (entry.state !== 'active' || entry.lastOutputAt === null) {
        continue;
      }
      const remaining = ACTIVE_WINDOW_MS - (now - entry.lastOutputAt);
      nextDelay = nextDelay === null ? remaining : Math.min(nextDelay, remaining);
    }
    if (nextDelay === null) {
      return;
    }
    this.decayTimer = setTimeout(() => this.settleActiveStates(), Math.max(nextDelay, 40));
  }

  private settleActiveStates() {
    const now = Date.now();
    let changed = false;
    for (const [sessionId, entry] of this.entries) {
      if (entry.state !== 'active' || entry.lastOutputAt === null || now - entry.lastOutputAt < ACTIVE_WINDOW_MS) {
        continue;
      }
      this.entries.set(sessionId, {
        repoId: entry.repoId,
        sessionId: entry.sessionId,
        state: 'running',
        lastOutputAt: null,
      });
      changed = true;
    }
    if (changed) {
      this.publishSnapshot();
      return;
    }
    this.scheduleDecay();
  }
}

export class TerminalSurfaceSession {
  private session: TerminalSessionInfo | null = null;
  private released = false;

  constructor(
    private readonly workspace: TerminalWorkspace,
    private readonly independent: boolean,
  ) {}

  /**
   * Flow: a late independent start is immediately closed after release; a default session remains reusable.
   */
  async start(request: TerminalSessionRequest) {
    const session = await (this.independent
      ? this.workspace.createSession(request)
      : this.workspace.ensureSession(request));
    if (this.released) {
      if (this.independent) {
        await this.workspace.closeSession(session.sessionId);
      }
      return null;
    }
    this.session = session;
    return session;
  }

  async restart(repoId: string, cols: number, rows: number) {
    if (!this.session) {
      return null;
    }
    const session = await this.workspace.restartSession(repoId, this.session.sessionId, cols, rows);
    if (this.released) {
      if (this.independent) {
        await this.workspace.closeSession(session.sessionId);
      }
      return null;
    }
    this.session = session;
    return session;
  }

  async release() {
    this.released = true;
    const session = this.session;
    this.session = null;
    if (this.independent && session) {
      await this.workspace.closeSession(session.sessionId);
    }
  }
}

const TerminalWorkspaceContext = createContext<TerminalWorkspace | null>(null);

export function TerminalWorkspaceProvider({ runtime, children }: { runtime: TerminalRuntime; children: ReactNode }) {
  const workspace = useMemo(() => new TerminalWorkspace(runtime), [runtime]);
  useEffect(() => () => workspace.dispose(), [workspace]);
  return <TerminalWorkspaceContext.Provider value={workspace}>{children}</TerminalWorkspaceContext.Provider>;
}

export function useTerminalWorkspace() {
  const workspace = useContext(TerminalWorkspaceContext);
  if (!workspace) {
    throw new Error('TerminalWorkspaceProvider 缺失');
  }
  return workspace;
}

export function useRepoTerminalStatuses() {
  const workspace = useTerminalWorkspace();
  return useSyncExternalStore(workspace.subscribe, workspace.getSnapshot, workspace.getSnapshot);
}

export function useTerminalWorkspaceTabs(repoDetails: Record<string, RepoDetail>, selectedRepoId: string) {
  const repoIds = Object.keys(repoDetails);
  const activeRepoId = repoDetails[selectedRepoId] ? selectedRepoId : (repoIds[0] ?? '');
  const [mainTabsByRepo, setMainTabsByRepo] = useState<WorkspaceMainTabsByRepo>({});
  const [terminalEnabled, setTerminalEnabled] = useState(false);
  const [independentTerminals, setIndependentTerminals] = useState<IndependentTerminalTab[]>([]);
  const terminalSequence = useRef(1);
  const mainTab = resolveMainTabForRepo(mainTabsByRepo, activeRepoId, independentTerminals);

  useEffect(() => {
    if (mainTab === 'terminal' || independentTerminals.some(tab => tab.id === mainTab)) {
      setTerminalEnabled(true);
    }
  }, [mainTab, independentTerminals]);

  useEffect(() => {
    setIndependentTerminals(current => {
      const next = current.filter(tab => Boolean(repoDetails[tab.repoId]));
      return next.length === current.length ? current : next;
    });
  }, [repoDetails]);

  const selectMainTab = (tab: WorkspaceMainTab) => {
    setMainTabsByRepo(current => selectMainTabForRepo(current, activeRepoId, tab));
  };

  const openIndependentTerminal = () => {
    const id = `terminal-${++terminalSequence.current}` as IndependentTerminalTabId;
    setIndependentTerminals(current => [...current, { id, repoId: activeRepoId }]);
    setMainTabsByRepo(current => selectMainTabForRepo(current, activeRepoId, id));
  };

  const closeIndependentTerminal = (id: IndependentTerminalTabId) => {
    const terminal = independentTerminals.find(tab => tab.id === id);
    setIndependentTerminals(current => current.filter(tab => tab.id !== id));
    if (terminal) {
      setMainTabsByRepo(current => current[terminal.repoId] === id
        ? selectMainTabForRepo(current, terminal.repoId, 'terminal')
        : current);
    }
  };

  return {
    activeRepoId,
    mainTab,
    terminalEnabled,
    independentTerminals,
    repoIndependentTerminals: getIndependentTerminalsForRepo(independentTerminals, activeRepoId),
    selectMainTab,
    openIndependentTerminal,
    closeIndependentTerminal,
  };
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

function readTerminalEvent(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const value = payload as Record<string, unknown>;
  const sessionId = typeof value.sessionId === 'string' ? value.sessionId : null;
  if (!sessionId) {
    return null;
  }
  return {
    sessionId,
    chunk: typeof value.chunk === 'string' ? value.chunk : '',
    exitCode: typeof value.exitCode === 'number' ? value.exitCode : undefined,
  };
}

function setRepoState(states: Map<string, RepoTerminalState>, repoId: string, next: RepoTerminalState) {
  const current = states.get(repoId);
  if (!current || terminalStatePriority(next) > terminalStatePriority(current)) {
    states.set(repoId, next);
  }
}

function terminalStatePriority(state: RepoTerminalState) {
  switch (state) {
    case 'active': return 6;
    case 'starting': return 5;
    case 'running': return 4;
    case 'failed': return 3;
    case 'exited': return 2;
    case 'idle': return 1;
  }
}
