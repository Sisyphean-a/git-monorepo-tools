export interface TerminalActivityEntry {
  sessionId: string | null;
  state: string;
  lastOutputAt: number | null;
}

export function recordTerminalOutput(current: TerminalActivityEntry, sessionId: string, now: number) {
  return {
    entry: {
      sessionId,
      state: 'active' as const,
      lastOutputAt: now,
    },
    shouldPublish: current.state !== 'active',
  };
}

export function shouldSettleTerminalActivity(entry: TerminalActivityEntry, now: number, activeWindowMs: number) {
  return entry.state === 'active'
    && entry.lastOutputAt !== null
    && now - entry.lastOutputAt >= activeWindowMs;
}
