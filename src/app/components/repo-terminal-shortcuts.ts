export type RepoTerminalShortcutAction = 'copy-selection' | 'paste-clipboard' | 'pass-through';

interface RepoTerminalShortcutEvent {
  readonly type: string;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey?: boolean;
  readonly key: string;
}

interface RepoTerminalShortcutHandlerEvent extends RepoTerminalShortcutEvent {
  readonly preventDefault: () => void;
}

interface TerminalShortcutBindings {
  readonly hasSelection: () => boolean;
  readonly copySelection: () => void;
  readonly pasteClipboard: () => void;
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
      return 'paste-clipboard';
    default:
      return 'pass-through';
  }
}

export function handleWindowsTerminalShortcutEvent(
  event: RepoTerminalShortcutHandlerEvent,
  bindings: TerminalShortcutBindings,
  platform: string,
) {
  switch (getWindowsTerminalShortcutAction(event, bindings.hasSelection(), platform)) {
    case 'copy-selection':
      bindings.copySelection();
      return false;
    case 'paste-clipboard':
      event.preventDefault();
      bindings.pasteClipboard();
      return false;
    default:
      return true;
  }
}

export async function pasteTerminalClipboard(
  getClipboardText: () => Promise<string>,
  transformPastedText: (text: string) => string,
  writeInput: (text: string) => Promise<void>,
) {
  const text = await getClipboardText();
  if (!text) {
    return false;
  }
  const pastedText = transformPastedText(text);
  if (!pastedText) {
    return false;
  }
  await writeInput(pastedText);
  return true;
}

export function queueTerminalInput(
  inputQueue: Promise<void>,
  writeInput: (data: string) => Promise<void>,
  data: string,
) {
  return inputQueue.then(() => writeInput(data));
}

function isWindowsPlatform(platform: string) {
  return platform.toLowerCase().startsWith('win');
}
