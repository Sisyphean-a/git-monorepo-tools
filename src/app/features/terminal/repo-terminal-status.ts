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

const ACTIVE_WINDOW_MS = 1400;

const listeners = new Set<() => void>();
const entries = new Map<string, RepoTerminalEntry>();
const sessionRepoIds = new Map<string, string>();

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
  const current = entries.get(repoId);
  setEntry(repoId, {
    sessionId: current?.sessionId ?? null,
    state: 'starting',
    lastOutputAt: null,
  });
}

export function setRepoTerminalFailed(repoId: string) {
  const current = entries.get(repoId);
  setEntry(repoId, {
    sessionId: current?.sessionId ?? null,
    state: 'failed',
    lastOutputAt: null,
  });
}

export function registerTerminalSession(session: TerminalSessionInfo) {
  if (!session.repoId || !session.sessionId) {
    return;
  }

  const current = entries.get(session.repoId);
  if (current?.sessionId && current.sessionId !== session.sessionId) {
    sessionRepoIds.delete(current.sessionId);
  }

  sessionRepoIds.set(session.sessionId, session.repoId);
  setEntry(session.repoId, {
    sessionId: session.sessionId,
    state: current?.sessionId === session.sessionId && current.state === 'active' ? 'active' : 'running',
    lastOutputAt: current?.sessionId === session.sessionId ? current.lastOutputAt : null,
  });
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
  const repoId = sessionRepoIds.get(sessionId);
  if (!repoId) {
    return;
  }

  const current = entries.get(repoId);
  if (!current || current.sessionId !== sessionId) {
    return;
  }

  const activity = recordTerminalOutput(current, sessionId, Date.now());
  if (!activity.shouldPublish) {
    entries.set(repoId, activity.entry);
    scheduleDecay();
    return;
  }
  setEntry(repoId, activity.entry);
}

function markTerminalExit(sessionId: string) {
  const repoId = sessionRepoIds.get(sessionId);
  sessionRepoIds.delete(sessionId);
  if (!repoId) {
    return;
  }

  const current = entries.get(repoId);
  if (!current || current.sessionId !== sessionId) {
    return;
  }

  setEntry(repoId, {
    sessionId: null,
    state: 'exited',
    lastOutputAt: null,
  });
}

function setEntry(repoId: string, entry: RepoTerminalEntry) {
  entries.set(repoId, entry);
  publishSnapshot();
}

function publishSnapshot() {
  snapshot = Object.freeze(
    Array.from(entries.entries()).reduce<TerminalStatusSnapshot>((accumulator, [repoId, entry]) => {
      accumulator[repoId] = entry.state;
      return accumulator;
    }, {}),
  );
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

  for (const [repoId, entry] of entries.entries()) {
    if (!shouldSettleTerminalActivity(entry, now, ACTIVE_WINDOW_MS)) {
      continue;
    }

    entries.set(repoId, {
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
