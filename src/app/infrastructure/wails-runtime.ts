import { ClipboardGetText, EventsOn } from '../../../frontend/wailsjs/runtime/runtime.js';
import type { RuntimeBackend } from '../application/ports';
import { readClipboardImagePath } from './wails-client';

export const wailsRuntime: RuntimeBackend = {
  onEvent: (event, handler) => EventsOn(event, handler),
  readClipboardImagePath,
  readClipboardText: () => ClipboardGetText(),
};
