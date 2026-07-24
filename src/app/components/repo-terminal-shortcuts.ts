export type RepoTerminalShortcutAction = 'copy-selection' | 'paste-clipboard' | 'send-ctrl-j' | 'send-shift-enter' | 'pass-through';
export type TerminalClipboardPasteSource = 'keyboard' | 'context-menu';

export const ctrlVInput = '\x16';
export const ctrlJInput = '\x0a';
export const shiftEnterInput = '\x1b[13;2u';

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
  readonly writeInput: (input: string) => void;
}

export function getWindowsTerminalShortcutAction(
  event: RepoTerminalShortcutEvent,
  hasSelection: boolean,
  platform: string,
): RepoTerminalShortcutAction {
  if (!isWindowsPlatform(platform) || event.type !== 'keydown') {
    return 'pass-through';
  }
  if (event.key === 'Enter' && event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
    return 'send-shift-enter';
  }
  if (event.key.toLowerCase() === 'j' && event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey) {
    return 'send-ctrl-j';
  }
  if (event.metaKey || event.ctrlKey === event.altKey) {
    return 'pass-through';
  }

  switch (event.key.toLowerCase()) {
    case 'c':
      return event.ctrlKey && hasSelection ? 'copy-selection' : 'pass-through';
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
    case 'send-ctrl-j':
      event.preventDefault();
      bindings.writeInput(ctrlJInput);
      return false;
    case 'send-shift-enter':
      event.preventDefault();
      bindings.writeInput(shiftEnterInput);
      return false;
    default:
      return true;
  }
}

interface TerminalClipboardPasteOptions {
  readonly source: TerminalClipboardPasteSource;
  readonly getClipboardImagePath?: () => Promise<string | null>;
  readonly getClipboardText: () => Promise<string>;
  readonly transformPastedText: (text: string) => string;
  readonly writeInput: (text: string) => Promise<void>;
}

export async function pasteTerminalClipboard(options: TerminalClipboardPasteOptions) {
  const fallbackInput = options.source === 'keyboard' ? ctrlVInput : undefined;
  const imagePath = await options.getClipboardImagePath?.();
  if (imagePath) {
    await options.writeInput(imagePath);
    return true;
  }
  let text: string;
  try {
    text = await options.getClipboardText();
  } catch (error) {
    if (!fallbackInput) {
      throw error;
    }
    await options.writeInput(fallbackInput);
    return true;
  }
  const input = text
    ? options.transformPastedText(text)
    : fallbackInput;
  if (!input) {
    return false;
  }
  await options.writeInput(input);
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
