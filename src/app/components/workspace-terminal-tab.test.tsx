import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { WorkspaceTerminalTab } from './workspace.js';

test('only exposes the terminal close control while another terminal exists', () => {
  const single = renderToStaticMarkup(
    <WorkspaceTerminalTab active closable={false} disabled={false} onSelect={() => {}} onClose={() => {}} />,
  );
  assert.doesNotMatch(single, /关闭终端/);

  const multiple = renderToStaticMarkup(
    <WorkspaceTerminalTab active closable disabled={false} onSelect={() => {}} onClose={() => {}} />,
  );
  assert.match(multiple, /aria-label="关闭终端"/);
});

test('disables both select and close while the repository is checking', () => {
  const html = renderToStaticMarkup(
    <WorkspaceTerminalTab active closable disabled onSelect={() => {}} onClose={() => {}} />,
  );
  assert.equal(html.match(/disabled=""/g)?.length, 2);
});
