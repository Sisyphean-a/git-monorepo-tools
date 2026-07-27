import { useEffect, useSyncExternalStore } from 'react';
import { useAppBackend } from '../../application/backend-context';
import type { RuntimeBackend } from '../../application/ports';
import type { TerminalSessionInfo } from '../../domain/types';
import { recordTerminalOutput, shouldSettleTerminalActivity } from './repo-terminal-activity';

export type RepoTerminalState = 'idle' | 'starting' | 'running' | 'active' | 'exited' | 'failed';

type TerminalStatusSnapshot = Record<string, RepoTerminalState>;

interface RepoTerminalEntry {
  sessionId: string | null;
  state: RepoTerminalState;
  lastOutputAt: number | null;
}

interface TerminalSessionEntry extends RepoTerminalEntry {
  repoId: string;
}

const ACTIVE_WINDOW_MS = 1400;

const listeners = new Set<() => void>();
const entries = new Map<string, TerminalSessionEntry>();
const pendingEntries = new Map<string, RepoTerminalState>();

let snapshot: TerminalStatusSnapshot = {};
let outputStop: (() => void) | null = null;
let exitStop: (() => void) | null = null;
let decayTimer: ReturnType<typeof setTimeout> | null = null;

export function useRepoTerminalStatuses() {
  const backend = useAppBackend();
  useEffect(() => {
    ensureTerminalTracking(backend.onEvent);
  }, [backend]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function setRepoTerminalStarting(repoId: string) {
  pendingEntries.set(repoId, 'starting');
  publishSnapshot();
}

export function setRepoTerminalFailed(repoId: string) {
  pendingEntries.set(repoId, 'failed');
  publishSnapshot();
}

export function registerTerminalSession(session: TerminalSessionInfo) {
  if (!session.repoId || !session.sessionId) {
    return;
  }

  pendingEntries.delete(session.repoId);
  const current = entries.get(session.sessionId);
  entries.set(session.sessionId, {
    repoId: session.repoId,
    sessionId: session.sessionId,
    state: current?.state === 'active' ? 'active' : 'running',
    lastOutputAt: current?.lastOutputAt ?? null,
  });
  publishSnapshot();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return snapshot;
}

function ensureTerminalTracking(onEvent: RuntimeBackend['onEvent']) {
  if (outputStop || exitStop || typeof window === 'undefined') {
    return;
  }

  outputStop = onEvent('repo-terminal-output', payload => {
    const sessionId = readSessionId(payload);
    if (!sessionId) {
      return;
    }
    markTerminalOutput(sessionId);
  });

  exitStop = onEvent('repo-terminal-exit', payload => {
    const sessionId = readSessionId(payload);
    if (!sessionId) {
      return;
    }
    markTerminalExit(sessionId);
  });
}

function readSessionId(payload: unknown) {
  if (!payload || typeof payload !== 'object') return null;
  const sessionId = (payload as Record<string, unknown>).sessionId;
  return typeof sessionId === 'string' ? sessionId : null;
}

function markTerminalOutput(sessionId: string) {
  const current = entries.get(sessionId);
  if (!current) {
    return;
  }

  const activity = recordTerminalOutput(current, sessionId, Date.now());
  entries.set(sessionId, { ...activity.entry, repoId: current.repoId });
  if (!activity.shouldPublish) {
    scheduleDecay();
    return;
  }
  publishSnapshot();
}

function markTerminalExit(sessionId: string) {
  const current = entries.get(sessionId);
  if (!current) {
    return;
  }

  entries.set(sessionId, {
    repoId: current.repoId,
    sessionId: null,
    state: 'exited',
    lastOutputAt: null,
  });
  publishSnapshot();
}

function publishSnapshot() {
  const states = new Map<string, RepoTerminalState>();
  for (const entry of entries.values()) {
    setRepoState(states, entry.repoId, entry.state);
  }
  for (const [repoId, state] of pendingEntries) {
    setRepoState(states, repoId, state);
  }

  snapshot = Object.freeze(Object.fromEntries(states));
  scheduleDecay();
  listeners.forEach(listener => listener());
}

function scheduleDecay() {
  if (decayTimer !== null) {
    clearTimeout(decayTimer);
    decayTimer = null;
  }

  const now = Date.now();
  let nextDelay: number | null = null;
  for (const entry of entries.values()) {
    if (entry.state !== 'active' || entry.lastOutputAt === null) {
      continue;
    }
    const remaining = ACTIVE_WINDOW_MS - (now - entry.lastOutputAt);
    nextDelay = nextDelay === null ? remaining : Math.min(nextDelay, remaining);
  }

  if (nextDelay === null) {
    return;
  }

  decayTimer = setTimeout(settleActiveStates, Math.max(nextDelay, 40));
}

function settleActiveStates() {
  const now = Date.now();
  let changed = false;

  for (const [sessionId, entry] of entries.entries()) {
    if (!shouldSettleTerminalActivity(entry, now, ACTIVE_WINDOW_MS)) {
      continue;
    }

    entries.set(sessionId, {
      repoId: entry.repoId,
      sessionId: entry.sessionId,
      state: 'running',
      lastOutputAt: null,
    });
    changed = true;
  }

  if (changed) {
    publishSnapshot();
    return;
  }

  scheduleDecay();
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
