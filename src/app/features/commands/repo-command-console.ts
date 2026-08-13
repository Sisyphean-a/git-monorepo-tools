import type { Dispatch, SetStateAction } from 'react';
import type { CommandConsoleState } from './command-console-state.js';

let nextSessionId = 0;

/**
 * Rule: a long-running command must not grow the console output without bound.
 * Effect: once the cap is exceeded the console keeps only the tail and marks itself truncated.
 */
export const MAX_COMMAND_OUTPUT_CHARS = 256 * 1024;

export function appendCommandOutput(current: string, text: string) {
  if (!text) {
    return { output: current, truncated: false };
  }
  const next = current + text;
  if (next.length <= MAX_COMMAND_OUTPUT_CHARS) {
    return { output: next, truncated: false };
  }
  return { output: next.slice(next.length - MAX_COMMAND_OUTPUT_CHARS), truncated: true };
}

export function createCommandConsoleSession(
  setCommandConsole: Dispatch<SetStateAction<CommandConsoleState | null>>,
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
    setCommandConsole(current => current?.sessionId === sessionId ? createState(status, endedAt) : current);
  };

  const write = (chunk: string) => {
    const appended = appendCommandOutput(output, chunk);
    output = appended.output;
    truncated = truncated || appended.truncated;
    sync('running');
  };

  setCommandConsole(createState('running'));

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
