import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEFAULT_SETTINGS } from '../infrastructure/settings-store.js';
import type { AppSettings } from '../domain/types.js';
import { useSidebarScan } from './use-sidebar-scan.js';

test('refreshSidebar requests a full workspace snapshot even before a sidebar snapshot exists', async () => {
  const requests: AppSettings[] = [];
  const errors: Array<string | null> = [];
  let refreshSidebar!: () => Promise<void>;

  function Probe() {
    const sidebar = useSidebarScan({
      settings: DEFAULT_SETTINGS,
      reportError: error => errors.push(error),
      refreshSnapshot: async settings => { requests.push(settings); },
    });
    refreshSidebar = sidebar.refreshSidebar;
    return null;
  }

  renderToStaticMarkup(createElement(Probe));
  await refreshSidebar();

  assert.deepEqual(requests, [DEFAULT_SETTINGS]);
  assert.deepEqual(errors, [null]);
});
