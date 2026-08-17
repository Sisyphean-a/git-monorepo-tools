export interface TerminalImeFocusTarget {
  blur(): void;
  focus(): void;
}

export interface TerminalImeFocusScheduler {
  request(callback: () => void): number;
  cancel(handle: number): void;
}

/**
 * Effect: reset WebView2's IME focus context after xterm moves or resizes.
 * Guarantee: only the newest scheduled focus restoration can run.
 */
export function scheduleTerminalImeFocusReset(
  terminal: TerminalImeFocusTarget,
  scheduler: TerminalImeFocusScheduler,
  pendingHandle: number | null,
): number {
  if (pendingHandle !== null) {
    scheduler.cancel(pendingHandle);
  }
  terminal.blur();
  return scheduler.request(() => terminal.focus());
}
