import type { CommandConsoleState } from './command-console-state.js';

export type CommandConsoleUpdater = (current: CommandConsoleState | null) => CommandConsoleState | null;

let nextSessionId = 0;

/**
 * Rule: a long-running command must not grow the console output without bound.
 * Effect: once the cap is exceeded the console keeps only the tail and marks itself truncated.
 */
export const MAX_COMMAND_OUTPUT_CHARS = 256 * 1024;

export function pruneCommandConsoles(
  current: Record<string, CommandConsoleState | null>,
  repoIds: readonly string[],
) {
  const knownRepoIds = new Set(repoIds);
  let changed = false;
  const next: Record<string, CommandConsoleState | null> = {};
  for (const [repoId, console] of Object.entries(current)) {
    if (!knownRepoIds.has(repoId)) {
      changed = true;
      continue;
    }
    next[repoId] = console;
  }
  return changed ? next : current;
}

export function formatCommandTime(timestamp: number) {
  const date = new Date(timestamp);
  return [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map(value => value.toString().padStart(2, '0'))
    .join(':');
}

export function appendCommandOutput(current: string, text: string) {
  if (!text) {
    return { output: current, truncated: false };
  }
  const next = current + text;
  if (next.length <= MAX_COMMAND_OUTPUT_CHARS) {
    return { output: next, truncated: false };
  }
  return { output: takeCommandOutputTail(next), truncated: true };
}

function takeCommandOutputTail(value: string) {
  let start = value.length - MAX_COMMAND_OUTPUT_CHARS;
  if (start > 0 && isLowSurrogate(value.charCodeAt(start))) {
    start += 1;
  }
  let end = value.length;
  if (end > start && isHighSurrogate(value.charCodeAt(end - 1))) {
    end -= 1;
  }
  return value.slice(start, end);
}

function isHighSurrogate(value: number) {
  return value >= 0xd800 && value <= 0xdbff;
}

function isLowSurrogate(value: number) {
  return value >= 0xdc00 && value <= 0xdfff;
}

export function createCommandConsoleSession(
  repoId: string,
  updateConsole: (updater: CommandConsoleUpdater) => void,
  title: string,
  command: string,
) {
  let output = '';
  let truncated = false;
  const startedAt = Date.now();
  const sessionId = ++nextSessionId;

  const createState = (status: CommandConsoleState['status'], endedAt?: number): CommandConsoleState => ({
    sessionId,
    title,
    command,
    status,
    output,
    ...(truncated ? { truncated: true } : {}),
    startedAt,
    endedAt,
  });
  const sync = (status: CommandConsoleState['status'], endedAt?: number) => {
    // Guard: only the current session may write to its own repo slot. An older
    // session (superseded or cleared) must not overwrite a newer one.
    updateConsole(current => current?.sessionId === sessionId ? createState(status, endedAt) : current);
  };

  const write = (chunk: string) => {
    const appended = appendCommandOutput(output, chunk);
    output = appended.output;
    truncated = truncated || appended.truncated;
    sync('running');
  };

  // Rule: a fresh command for this repo replaces the repo's current console.
  updateConsole(() => createState('running'));

  return {
    write,
    appendLine(line: string) {
      write(output ? `\n${line}` : line);
    },
    finish(status: CommandConsoleState['status']) {
      sync(status, Date.now());
    },
  };
}
