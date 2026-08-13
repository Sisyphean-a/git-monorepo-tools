export type RepoTerminalShortcutAction =
  | { readonly type: 'copy-selection' }
  | { readonly type: 'paste-clipboard' }
  | { readonly type: 'send-input'; readonly input: string }
  | { readonly type: 'pass-through' };
export type TerminalClipboardPasteSource = 'keyboard' | 'context-menu';

export const ctrlVInput = '\x16';
export const ctrlJInput = '\x0a';
export const ctrlWInput = '\x17';
// Pi handles a raw line feed as its cross-terminal newline action.
export const shiftEnterInput = ctrlJInput;

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
  readonly onShortcutAction?: (action: RepoTerminalShortcutAction) => void;
}

interface TerminalShortcutRule {
  readonly key: string;
  readonly modifiers: TerminalShortcutModifiers;
  readonly action: Exclude<RepoTerminalShortcutAction, { readonly type: 'pass-through' }>;
  readonly requiresSelection?: boolean;
}

interface TerminalShortcutModifiers {
  readonly ctrlKey?: boolean;
  readonly altKey?: boolean;
  readonly metaKey?: boolean;
  readonly shiftKey?: boolean;
}

const passThroughAction: RepoTerminalShortcutAction = { type: 'pass-through' };

/**
 * Rule: only combinations whose browser encoding loses Pi-required meaning are intercepted here.
 * Guarantee: every unlisted key and every extra modifier stays on xterm's native path.
 */
const windowsTerminalShortcutRules: readonly TerminalShortcutRule[] = [
  {
    key: 'enter',
    modifiers: { shiftKey: true, ctrlKey: false, altKey: false, metaKey: false },
    action: { type: 'send-input', input: shiftEnterInput },
  },
  {
    key: 'j',
    modifiers: { ctrlKey: true, shiftKey: false, altKey: false, metaKey: false },
    action: { type: 'send-input', input: ctrlJInput },
  },
  {
    key: 'backspace',
    modifiers: { ctrlKey: true, shiftKey: false, altKey: false, metaKey: false },
    action: { type: 'send-input', input: ctrlWInput },
  },
  {
    key: 'c',
    modifiers: { ctrlKey: true, shiftKey: false, altKey: false, metaKey: false },
    action: { type: 'copy-selection' },
    requiresSelection: true,
  },
  {
    key: 'v',
    modifiers: { ctrlKey: true, shiftKey: false, altKey: false, metaKey: false },
    action: { type: 'paste-clipboard' },
  },
  {
    key: 'v',
    modifiers: { ctrlKey: false, shiftKey: false, altKey: true, metaKey: false },
    action: { type: 'paste-clipboard' },
  },
];

export function getWindowsTerminalShortcutAction(
  event: RepoTerminalShortcutEvent,
  hasSelection: boolean,
  platform: string,
): RepoTerminalShortcutAction {
  if (!isWindowsPlatform(platform) || event.type !== 'keydown') {
    return passThroughAction;
  }

  const rule = windowsTerminalShortcutRules.find(candidate => matchesTerminalShortcut(event, candidate));
  if (!rule || (rule.requiresSelection && !hasSelection)) {
    return passThroughAction;
  }
  return rule.action;
}

function matchesTerminalShortcut(event: RepoTerminalShortcutEvent, rule: TerminalShortcutRule) {
  return event.key.toLowerCase() === rule.key
    && (rule.modifiers.ctrlKey === undefined || event.ctrlKey === rule.modifiers.ctrlKey)
    && (rule.modifiers.altKey === undefined || event.altKey === rule.modifiers.altKey)
    && (rule.modifiers.metaKey === undefined || event.metaKey === rule.modifiers.metaKey)
    && (rule.modifiers.shiftKey === undefined || (event.shiftKey ?? false) === rule.modifiers.shiftKey);
}

export function handleWindowsTerminalShortcutEvent(
  event: RepoTerminalShortcutHandlerEvent,
  bindings: TerminalShortcutBindings,
  platform: string,
) {
  const action = getWindowsTerminalShortcutAction(event, bindings.hasSelection(), platform);
  if (event.type === 'keydown') {
    bindings.onShortcutAction?.(action);
  }
  switch (action.type) {
    case 'copy-selection':
      bindings.copySelection();
      return false;
    case 'paste-clipboard':
      event.preventDefault();
      bindings.pasteClipboard();
      return false;
    case 'send-input':
      event.preventDefault();
      bindings.writeInput(action.input);
      return false;
    case 'pass-through':
      return true;
  }
}

interface TerminalClipboardPasteOptions {
  readonly source: TerminalClipboardPasteSource;
  /**
   * Rule: write confirmed Pi text pastes with raw LF so ConPTY cannot turn
   * pasted line separators into Enter submissions after stripping paste markers.
   */
  readonly usePiLineFeedPaste?: boolean;
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
    ? options.usePiLineFeedPaste
      ? normalizePiLineFeedPaste(text)
      : options.transformPastedText(text)
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

function normalizePiLineFeedPaste(text: string) {
  return text.replace(/\r\n?|\n/g, '\n');
}

function isWindowsPlatform(platform: string) {
  return platform.toLowerCase().startsWith('win');
}
