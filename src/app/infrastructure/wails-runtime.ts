import { ClipboardGetText, EventsOn } from '../../../frontend/wailsjs/runtime/runtime.js';
import type { RuntimeBackend } from '../application/ports';

export const wailsRuntime: RuntimeBackend = {
  onEvent: (event, handler) => EventsOn(event, handler),
  readClipboardText: () => ClipboardGetText(),
};
