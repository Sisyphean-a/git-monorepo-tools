export type RepoTerminalShortcutAction = 'copy-selection' | 'paste' | 'pass-through';

interface RepoTerminalShortcutEvent {
  readonly type: string;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly metaKey: boolean;
  readonly key: string;
}

export function getWindowsTerminalShortcutAction(
  event: RepoTerminalShortcutEvent,
  hasSelection: boolean,
  platform: string,
): RepoTerminalShortcutAction {
  if (!isWindowsPlatform(platform) || event.type !== 'keydown') {
    return 'pass-through';
  }
  if (!event.ctrlKey || event.altKey || event.metaKey) {
    return 'pass-through';
  }

  switch (event.key.toLowerCase()) {
    case 'c':
      return hasSelection ? 'copy-selection' : 'pass-through';
    case 'v':
      return 'paste';
    default:
      return 'pass-through';
  }
}

function isWindowsPlatform(platform: string) {
  return platform.toLowerCase().startsWith('win');
}
