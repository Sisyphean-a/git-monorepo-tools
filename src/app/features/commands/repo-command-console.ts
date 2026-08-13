import type { Dispatch, SetStateAction } from 'react';
import type { CommandConsoleState } from './command-console-state.js';

let nextSessionId = 0;

export function createCommandConsoleSession(
  setCommandConsole: Dispatch<SetStateAction<CommandConsoleState | null>>,
  title: string,
  command: string,
) {
  let output = '';
  const startedAt = Date.now();
  const sessionId = ++nextSessionId;

  const createState = (status: CommandConsoleState['status'], endedAt?: number): CommandConsoleState => ({
    sessionId,
    title,
    command,
    status,
    output,
    startedAt,
    endedAt,
  });
  const sync = (status: CommandConsoleState['status'], endedAt?: number) => {
    setCommandConsole(current => current?.sessionId === sessionId ? createState(status, endedAt) : current);
  };

  const write = (chunk: string) => {
    output += chunk;
    sync('running');
  };

  setCommandConsole(createState('running'));

  return {
    write,
    appendLine(line: string) {
      output = output ? `${output}\n${line}` : line;
      sync('running');
    },
    finish(status: CommandConsoleState['status']) {
      sync(status, Date.now());
    },
  };
}
