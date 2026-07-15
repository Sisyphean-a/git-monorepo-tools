import type { AppBackend } from '../application/ports';
import { wailsClient } from './wails-client';
import { wailsRuntime } from './wails-runtime';

export const wailsAppBackend: AppBackend = {
  ...wailsClient,
  ...wailsRuntime,
};
