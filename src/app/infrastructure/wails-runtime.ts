import { BrowserOpenURL, EventsOn } from '../../../frontend/wailsjs/runtime/runtime.js';
import type { RuntimeBackend } from '../application/ports';
import { readClipboardImagePath, readClipboardText } from './wails-client';

export const wailsRuntime: RuntimeBackend = {
  onEvent: (event, handler) => EventsOn(event, handler),
  readClipboardImagePath,
  readClipboardText,
  openExternalURL: url => BrowserOpenURL(url),
};
