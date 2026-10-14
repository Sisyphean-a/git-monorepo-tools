import test from 'node:test';
import assert from 'node:assert/strict';
import { createFileBrowserSession } from './file-browser-session.js';
import type { FilePreviewRenderer } from './file-renderer.js';
import { maxPreviewRenderBytes } from './file-preview-kind.js';
import { DEFAULT_SETTINGS } from '../../infrastructure/settings-store.js';
import type { RepoFileContent, RepoTreeEntry } from '../../domain/types.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function file(path = 'notes.txt', revision = 'v1', content = 'hello'): RepoFileContent {
  return { path, revision, content, size: content.length };
}

function fixture() {
  let settings = DEFAULT_SETTINGS;
  let notifications = 0;
  let rendererLoads = 0;
  let renders = 0;
  const options: Parameters<typeof createFileBrowserSession>[0] = {
    repoId: 'a', target: { path: 'E:/a', category: 'test' }, getSettings: () => settings,
    onChange: () => { notifications++; },
    backend: { listRepoDirectory: async () => [], readRepoFile: async request => file(request.path), readRepoFileIfChanged: async () => null },
    loadRenderer: async () => { rendererLoads++; return { renderFilePreviewHtml: input => { renders++; return `<p>${input.content}</p>`; } }; },
  };
  return { options, session: createFileBrowserSession(options), counts: () => ({ notifications, rendererLoads, renders }), setSettings: (next: typeof settings) => { settings = next; } };
}

test('directory reads coalesce, retain old entries on failure and retry with current settings', async () => {
  const f = fixture();
  const pending = deferred<RepoTreeEntry[]>();
  let calls = 0;
  f.options.backend.listRepoDirectory = async request => {
    calls++;
    assert.equal(request.settings, DEFAULT_SETTINGS);
    assert.equal(request.repoId, 'a');
    assert.deepEqual(request.target, { path: 'E:/a', category: 'test' });
    return pending.promise;
  };
  const first = f.session.loadDirectory('src');
  await f.session.loadDirectory('src');
  assert.equal(calls, 1);
  const entries: RepoTreeEntry[] = [{ path: 'src/a.txt', name: 'a.txt', isDir: false }];
  pending.resolve(entries);
  await first;
  f.options.backend.listRepoDirectory = async () => { throw { message: 'permission denied' }; };
  await f.session.loadDirectory('src');
  assert.deepEqual(f.session.readState().directories.src, { status: 'error', entries, message: 'permission denied' });
  const settings = { ...DEFAULT_SETTINGS, scanRoots: [] };
  f.setSettings(settings);
  f.options.backend.listRepoDirectory = async request => { assert.equal(request.settings, settings); return []; };
  await f.session.loadDirectory('src');
  assert.equal(f.session.readState().directories.src?.status, 'loaded');
});

test('collapsing a directory invalidates its subtree without releasing similarly named siblings', async () => {
  const f = fixture();
  await f.session.loadDirectory('src-other');
  const pending = deferred<RepoTreeEntry[]>();
  f.options.backend.listRepoDirectory = () => pending.promise;
  const parent = f.session.loadDirectory('src');
  const child = f.session.loadDirectory('src/nested');
  f.session.releaseDirectory('src');
  pending.resolve([]);
  await Promise.all([parent, child]);
  assert.deepEqual(Object.keys(f.session.readState().directories), ['src-other']);
  await f.session.loadDirectory('src');
  assert.equal(f.session.readState().directories.src?.status, 'loaded');
  f.session.releaseDirectory('');
  assert.deepEqual(f.session.readState().directories, {});
});

test('file reads coalesce and late selections cannot overwrite the currently selected file', async () => {
  const f = fixture();
  const old = deferred<RepoFileContent>();
  let reads = 0;
  f.options.backend.readRepoFile = async request => { reads++; return request.path === 'old.txt' ? old.promise : file(request.path); };
  const pending = f.session.loadFile('old.txt', true);
  await f.session.loadFile('old.txt', true);
  assert.equal(reads, 1);
  await f.session.loadFile('new.txt', true);
  old.resolve(file('old.txt'));
  await pending;
  assert.deepEqual(f.session.readState().fileState, { status: 'loaded', file: file('new.txt') });
  assert.equal(f.counts().rendererLoads, 0);
});

test('revision checks avoid unchanged rendering, advance equal-content revisions and lazily render changed content', async () => {
  const f = fixture();
  await f.session.loadFile('a.ts', true);
  const displayed = f.session.readState();
  f.options.backend.readRepoFileIfChanged = async (_request, revision) => { assert.equal(revision, 'v1'); return null; };
  await f.session.loadFile('a.ts', false, true);
  assert.equal(f.session.readState(), displayed);
  f.options.backend.readRepoFileIfChanged = async () => file('a.ts', 'v2');
  await f.session.loadFile('a.ts', false, true);
  assert.equal(f.session.readState(), displayed);
  f.options.backend.readRepoFileIfChanged = async (_request, revision) => { assert.equal(revision, 'v2'); return file('a.ts', 'v3', 'changed'); };
  await f.session.loadFile('a.ts', false, true);
  assert.equal(f.session.readState().renderedFile?.html, '<p>changed</p>');
  assert.equal(f.counts().renders, 2);
});

test('large files skip the renderer and rendering failures preserve readable content with a distinct notice', async () => {
  const f = fixture();
  const large = { ...file('large.ts'), size: maxPreviewRenderBytes + 1 };
  f.options.backend.readRepoFile = async () => large;
  await f.session.loadFile('large.ts', true);
  assert.equal(f.counts().rendererLoads, 0);
  assert.deepEqual(f.session.readState().fileState, { status: 'loaded', file: large });
  assert.equal(f.session.readState().renderNotice, '文件较大，已关闭高亮与预览渲染');
  f.options.backend.readRepoFile = async () => file('README.md');
  f.options.loadRenderer = async () => { throw 'renderer failed'; };
  await f.session.loadFile('README.md', true);
  assert.equal(f.session.readState().fileState.status, 'loaded');
  assert.equal(f.session.readState().renderedFile, null);
  assert.equal(f.session.readState().renderNotice, '预览渲染失败，已按纯文本显示：renderer failed');
});

test('read failures release the revision so retries request the body instead of checking stale metadata', async () => {
  const f = fixture();
  await f.session.loadFile('a.ts', true);
  f.options.backend.readRepoFileIfChanged = async () => { throw new Error('missing file'); };
  await f.session.loadFile('a.ts', false, true);
  assert.deepEqual(f.session.readState().fileState, { status: 'error', path: 'a.ts', message: 'missing file' });
  assert.equal(f.session.readState().renderedFile, null);
  f.options.backend.readRepoFile = async () => file('a.ts', 'v2');
  await f.session.loadFile('a.ts', false, true);
  assert.equal(f.session.readState().fileState.status, 'loaded');
});

test('release drops all cached content and suppresses late reads, failures and rendering before reentry', async () => {
  for (const failure of [false, true]) {
    const f = fixture();
    const directory = deferred<RepoTreeEntry[]>();
    const body = deferred<RepoFileContent>();
    f.options.backend.listRepoDirectory = () => directory.promise;
    f.options.backend.readRepoFile = () => body.promise;
    const reading = Promise.all([f.session.loadDirectory(''), f.session.loadFile('a.ts')]);
    f.session.release();
    const released = f.session.readState();
    const notifications = f.counts().notifications;
    if (failure) { directory.reject('late directory error'); body.reject('late body error'); }
    else { directory.resolve([]); body.resolve(file('a.ts')); }
    await reading;
    assert.equal(f.session.readState(), released);
    assert.equal(f.counts().notifications, notifications);
    assert.deepEqual(released, { directories: {}, fileState: { status: 'idle' }, renderedFile: null, renderNotice: null });
    f.options.backend.readRepoFile = async () => file('a.ts');
    await f.session.loadFile('a.ts', false, true);
    assert.equal(f.session.readState().fileState.status, 'loaded');
  }

  const f = fixture();
  const renderer = deferred<FilePreviewRenderer>();
  const rendering = deferred<void>();
  f.options.loadRenderer = () => { rendering.resolve(); return renderer.promise; };
  const pending = f.session.loadFile('a.ts');
  await rendering.promise;
  f.session.release();
  f.options.loadRenderer = async () => ({ renderFilePreviewHtml: () => 'new' });
  await f.session.loadFile('new.ts');
  const latest = f.session.readState();
  renderer.resolve({ renderFilePreviewHtml: () => 'old' });
  await pending;
  assert.equal(f.session.readState(), latest);
  assert.equal(latest.renderedFile?.path, 'new.ts');
});
