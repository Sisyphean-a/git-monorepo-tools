import type { Dispatch, SetStateAction } from 'react';
import type { CommandConsoleState } from '../../components/ai-commit-panel';

export function createCommandConsoleSession(
  setCommandConsole: Dispatch<SetStateAction<CommandConsoleState | null>>,
  title: string,
  command: string,
  shouldSync: () => boolean = () => true,
) {
  let output = '';
  const startedAt = Date.now();

  const sync = (status: CommandConsoleState['status'], endedAt?: number) => {
    if (!shouldSync()) return;
    setCommandConsole({
      title,
      command,
      status,
      output,
      startedAt,
      endedAt,
    });
  };

  const write = (chunk: string) => {
    output += chunk;
    sync('running');
  };

  sync('running');

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
