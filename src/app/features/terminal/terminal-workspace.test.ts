import test from 'node:test';
import assert from 'node:assert/strict';
import type { TerminalSessionRequest } from '../../application/ports.js';
import type { TerminalSessionInfo } from '../../domain/types.js';
import { TerminalWorkspace, type TerminalRuntime } from './terminal-workspace.js';

type RuntimeEventHandler = (payload: unknown) => void;

type FakeRuntime = TerminalRuntime & {
  emit(event: string, payload: unknown): void;
  closedSessionIDs: string[];
  writes: Array<{ sessionId: string; data: string }>;
  sessionRequests: TerminalSessionRequest[];
};

function createRuntime(): FakeRuntime {
  const handlers = new Map<string, Set<RuntimeEventHandler>>();
  const sessionRequests: TerminalSessionRequest[] = [];
  const writes: Array<{ sessionId: string; data: string }> = [];
  const closedSessionIDs: string[] = [];
  let sequence = 0;
  const start = async (request: TerminalSessionRequest) => {
    sessionRequests.push(request);
    sequence += 1;
    return {
      sessionId: `term-${sequence}`,
      repoId: request.repoId,
      repoPath: request.repoPath,
      shell: 'powershell',
      startedAt: sequence,
    };
  };

  return {
    sessionRequests,
    writes,
    closedSessionIDs,
    ensureTerminalSession: start,
    createTerminalSession: start,
    restartTerminalSession: async (sessionId: string, cols: number, rows: number) => ({
      sessionId: `${sessionId}-restart`,
      repoId: 'repo-a',
      repoPath: 'E:/repo-a',
      shell: 'powershell',
      startedAt: cols + rows,
    }),
    closeTerminalSession: async (sessionId: string) => {
      closedSessionIDs.push(sessionId);
    },
    writeTerminalInput: async (sessionId: string, data: string) => {
      writes.push({ sessionId, data });
    },
    resizeTerminal: async () => undefined,
    onEvent: (event: string, handler: RuntimeEventHandler) => {
      const eventHandlers = handlers.get(event) ?? new Set<RuntimeEventHandler>();
      eventHandlers.add(handler);
      handlers.set(event, eventHandlers);
      return () => eventHandlers.delete(handler);
    },
    readClipboardImagePath: async () => null,
    readClipboardText: async () => '',
    emit: (event, payload) => {
      handlers.get(event)?.forEach(handler => handler(payload));
    },
  };
}

test('keeps default and independent sessions in one lifecycle', async () => {
  const runtime = createRuntime();
  const workspace = new TerminalWorkspace(runtime);
  const defaultOutput: string[] = [];
  const independentOutput: string[] = [];
  const defaultExits: number[] = [];
  const independentExits: number[] = [];
  const defaultSubscription = workspace.subscribeSession(chunk => defaultOutput.push(chunk), code => defaultExits.push(code));
  const independentSubscription = workspace.subscribeSession(chunk => independentOutput.push(chunk), code => independentExits.push(code));

  const defaultSession = await workspace.ensureSession({ repoId: 'repo-a', repoPath: 'E:/repo-a' });
  const independentSession = await workspace.createSession({ repoId: 'repo-a', repoPath: 'E:/repo-a' });
  defaultSubscription.bindSession(defaultSession.sessionId);
  independentSubscription.bindSession(independentSession.sessionId);

  assert.equal(runtime.sessionRequests.length, 2);
  assert.equal(workspace.getSnapshot()['repo-a'], 'running');

  runtime.emit('repo-terminal-output', { sessionId: defaultSession.sessionId, chunk: 'default' });
  runtime.emit('repo-terminal-output', { sessionId: independentSession.sessionId, chunk: 'independent' });
  assert.deepEqual(defaultOutput, ['default']);
  assert.deepEqual(independentOutput, ['independent']);
  assert.equal(workspace.getSnapshot()['repo-a'], 'active');

  runtime.emit('repo-terminal-exit', { sessionId: independentSession.sessionId, exitCode: 7 });
  assert.deepEqual(defaultExits, []);
  assert.deepEqual(independentExits, [7]);
  assert.equal(workspace.getSnapshot()['repo-a'], 'active');

  await workspace.closeSession(defaultSession.sessionId);
  assert.deepEqual(runtime.closedSessionIDs, [defaultSession.sessionId]);
  defaultSubscription.dispose();
  independentSubscription.dispose();
  workspace.dispose();
});

test('replays startup output and exit that arrive before a surface binds its session', async () => {
  const runtime = createRuntime();
  const workspace = new TerminalWorkspace(runtime);
  const session = await workspace.ensureSession({ repoId: 'repo-a', repoPath: 'E:/repo-a' });
  const output: string[] = [];
  const exits: number[] = [];

  runtime.emit('repo-terminal-output', { sessionId: session.sessionId, chunk: '\x1b[?2004h' });
  runtime.emit('repo-terminal-output', { sessionId: session.sessionId, chunk: '\x1b[>1u' });
  runtime.emit('repo-terminal-exit', { sessionId: session.sessionId, exitCode: 7 });

  const subscription = workspace.subscribeSession(chunk => output.push(chunk), code => exits.push(code));
  subscription.bindSession(session.sessionId);
  subscription.bindSession(session.sessionId);

  assert.deepEqual(output, ['\x1b[?2004h', '\x1b[>1u']);
  assert.deepEqual(exits, [7]);
  assert.equal(workspace.getSnapshot()['repo-a'], 'exited');
  subscription.dispose();
  assert.equal(workspace.getSnapshot()['repo-a'], undefined);
  workspace.dispose();
});

test('fails explicitly instead of growing an unbound output cache forever', async () => {
  const runtime = createRuntime();
  const workspace = new TerminalWorkspace(runtime, { maxPendingOutputBytes: 1024 });
  const session = await workspace.ensureSession({ repoId: 'repo-a', repoPath: 'E:/repo-a' });
  const failures: string[] = [];
  const exits: number[] = [];

  runtime.emit('repo-terminal-output', { sessionId: session.sessionId, chunk: 'a'.repeat(600) });
  runtime.emit('repo-terminal-output', { sessionId: session.sessionId, chunk: 'b'.repeat(600) });
  runtime.emit('repo-terminal-output', { sessionId: session.sessionId, chunk: 'c'.repeat(600) });
  runtime.emit('repo-terminal-exit', { sessionId: session.sessionId, exitCode: 3 });

  const subscription = workspace.subscribeSession(
    () => assert.fail('overflowed startup output must not be replayed as a partial stream'),
    code => exits.push(code),
    failure => failures.push(failure),
  );
  subscription.bindSession(session.sessionId);

  assert.deepEqual(exits, [3]);
  assert.equal(failures.length, 1);
  assert.match(failures[0] ?? '', /超过 1024 字节/);
  subscription.dispose();
  workspace.dispose();
});

test('binds a surface lifecycle to its current session and ignores replaced output', async () => {
  const runtime = createRuntime();
  const workspace = new TerminalWorkspace(runtime);
  const output: string[] = [];
  const exits: number[] = [];
  const surface = workspace.createSurfaceSession(false, {
    onOutput: chunk => output.push(chunk),
    onExit: exitCode => exits.push(exitCode),
    onDeliveryFailure: message => assert.fail(message),
  });

  const first = await surface.start({ repoId: 'repo-a', repoPath: 'E:/repo-a' });
  assert.ok(first);
  runtime.emit('repo-terminal-output', { sessionId: first.sessionId, chunk: 'first' });

  const replacement = await surface.reopen({ repoId: 'repo-a', repoPath: 'E:/repo-a', cols: 120, rows: 32 });
  assert.ok(replacement);
  runtime.emit('repo-terminal-output', { sessionId: first.sessionId, chunk: 'discarded' });
  runtime.emit('repo-terminal-output', { sessionId: replacement.sessionId, chunk: 'replacement' });
  runtime.emit('repo-terminal-exit', { sessionId: replacement.sessionId, exitCode: 0 });

  assert.deepEqual(output, ['first', 'replacement']);
  assert.deepEqual(exits, [0]);
  assert.equal(surface.getSession(), null);
  await surface.release();
  workspace.dispose();
});

test('restores delivery but starts fresh after a reopen restart fails', async () => {
  const runtime = createRuntime();
  const workspace = new TerminalWorkspace(runtime);
  const output: string[] = [];
  const surface = workspace.createSurfaceSession(false, {
    onOutput: chunk => output.push(chunk),
    onExit: () => undefined,
    onDeliveryFailure: message => assert.fail(message),
  });
  const session = await surface.start({ repoId: 'repo-a', repoPath: 'E:/repo-a' });
  assert.ok(session);
  runtime.restartTerminalSession = async () => {
    throw new Error('restart failed');
  };

  await assert.rejects(
    surface.reopen({ repoId: 'repo-a', repoPath: 'E:/repo-a', cols: 120, rows: 32 }),
    /restart failed/,
  );
  runtime.emit('repo-terminal-output', { sessionId: session.sessionId, chunk: 'still-delivered' });

  assert.deepEqual(output, ['still-delivered']);
  assert.equal(surface.getSession(), null);
  await surface.release();
  workspace.dispose();
});

test('does not retain a subscription when a released surface is started again', async () => {
  const runtime = createRuntime();
  const workspace = new TerminalWorkspace(runtime);
  const delivered: string[] = [];
  const surface = workspace.createSurfaceSession(false, {
    onOutput: chunk => delivered.push(chunk),
    onExit: () => undefined,
    onDeliveryFailure: () => undefined,
  });
  await surface.release();

  assert.equal(await surface.start({ repoId: 'repo-a', repoPath: 'E:/repo-a' }), null);
  runtime.emit('repo-terminal-output', { sessionId: 'term-1', chunk: 'must not deliver' });

  assert.deepEqual(delivered, []);
  workspace.dispose();
});

test('releases independent sessions, including a session that starts after disposal', async () => {
  const runtime = createRuntime();
  const workspace = new TerminalWorkspace(runtime);
  const independent = workspace.createSurfaceSession(true, emptySurfaceHandlers());
  const independentSession = await independent.start({ repoId: 'repo-a', repoPath: 'E:/repo-a' });
  assert.ok(independentSession);
  await independent.release();
  assert.deepEqual(runtime.closedSessionIDs, [independentSession.sessionId]);

  const defaultSession = workspace.createSurfaceSession(false, emptySurfaceHandlers());
  await defaultSession.start({ repoId: 'repo-a', repoPath: 'E:/repo-a' });
  await defaultSession.release();
  assert.deepEqual(runtime.closedSessionIDs, [independentSession.sessionId]);

  let resolveStart!: (session: TerminalSessionInfo) => void;
  const delayed = new Promise<TerminalSessionInfo>(resolve => {
    resolveStart = resolve;
  });
  runtime.createTerminalSession = async () => delayed;
  const delayedSession = workspace.createSurfaceSession(true, emptySurfaceHandlers());
  const starting = delayedSession.start({ repoId: 'repo-b', repoPath: 'E:/repo-b' });
  const releasingIndependent = delayedSession.release();
  resolveStart({
    sessionId: 'term-delayed',
    repoId: 'repo-b',
    repoPath: 'E:/repo-b',
    shell: 'powershell',
    startedAt: 3,
  });

  assert.equal(await starting, null);
  await releasingIndependent;
  assert.deepEqual(runtime.closedSessionIDs, [independentSession.sessionId, 'term-delayed']);

  let resolveDefaultStart!: (session: TerminalSessionInfo) => void;
  const delayedDefaultStart = new Promise<TerminalSessionInfo>(resolve => {
    resolveDefaultStart = resolve;
  });
  runtime.ensureTerminalSession = async () => delayedDefaultStart;
  const delayedDefault = workspace.createSurfaceSession(false, emptySurfaceHandlers());
  const startingDefault = delayedDefault.start({ repoId: 'repo-c', repoPath: 'E:/repo-c' });
  const releasingDefault = delayedDefault.release();
  resolveDefaultStart({
    sessionId: 'term-default-delayed',
    repoId: 'repo-c',
    repoPath: 'E:/repo-c',
    shell: 'powershell',
    startedAt: 4,
  });

  assert.equal(await startingDefault, null);
  await releasingDefault;
  runtime.emit('repo-terminal-output', { sessionId: 'term-default-delayed', chunk: 'must not cache after release' });
  const abandonedOutput: string[] = [];
  const abandonedSubscription = workspace.subscribeSession(chunk => abandonedOutput.push(chunk), () => {});
  abandonedSubscription.bindSession('term-default-delayed');
  assert.deepEqual(abandonedOutput, []);
  abandonedSubscription.dispose();
  workspace.dispose();
});

test('can close a default session when its surface is released for automatic cleanup', async () => {
  const runtime = createRuntime();
  const workspace = new TerminalWorkspace(runtime);
  const surface = workspace.createSurfaceSession(false, emptySurfaceHandlers());
  const session = await surface.start({ repoId: 'repo-a', repoPath: 'E:/repo-a' });

  assert.ok(session);
  await surface.release(true);
  assert.deepEqual(runtime.closedSessionIDs, [session.sessionId]);
  workspace.dispose();
});

test('automatic cleanup closes a default session that finishes starting after leaving', async () => {
  const runtime = createRuntime();
  let finishStart!: (session: TerminalSessionInfo) => void;
  runtime.ensureTerminalSession = () => new Promise(resolve => { finishStart = resolve; });
  const workspace = new TerminalWorkspace(runtime);
  const surface = workspace.createSurfaceSession(false, emptySurfaceHandlers());
  const starting = surface.start({ repoId: 'repo-a', repoPath: 'E:/repo-a' });
  let closed = false;
  const closing = surface.release(true).then(() => { closed = true; });
  await Promise.resolve();
  assert.equal(closed, false);
  finishStart({ sessionId: 'late-default', repoId: 'repo-a', repoPath: 'E:/repo-a', shell: 'powershell', startedAt: 1 });
  assert.equal(await starting, null);
  await closing;
  assert.deepEqual(runtime.closedSessionIDs, ['late-default']);
  workspace.dispose();
});

test('automatic cleanup waits for a replacement and closes only the new session', async () => {
  const runtime = createRuntime();
  const workspace = new TerminalWorkspace(runtime);
  const surface = workspace.createSurfaceSession(false, emptySurfaceHandlers());
  await surface.start({ repoId: 'repo-a', repoPath: 'E:/repo-a' });
  let finishRestart!: (session: TerminalSessionInfo) => void;
  runtime.restartTerminalSession = () => new Promise(resolve => { finishRestart = resolve; });
  const restarting = surface.restart('repo-a', 80, 24);
  const closing = surface.release(true);
  finishRestart({ sessionId: 'replacement', repoId: 'repo-a', repoPath: 'E:/repo-a', shell: 'powershell', startedAt: 2 });
  assert.equal(await restarting, null);
  await closing;
  assert.deepEqual(runtime.closedSessionIDs, ['replacement']);
  workspace.dispose();
});

test('cleanup preserves both restart and old-session close failures', async () => {
  const runtime = createRuntime();
  const workspace = new TerminalWorkspace(runtime);
  const surface = workspace.createSurfaceSession(false, emptySurfaceHandlers());
  await surface.start({ repoId: 'repo-a', repoPath: 'E:/repo-a' });
  runtime.restartTerminalSession = async () => { throw new Error('restart failed'); };
  runtime.closeTerminalSession = async () => { throw new Error('old close failed'); };
  const restarting = assert.rejects(surface.restart('repo-a', 80, 24), /restart failed.*old close failed/);
  const closing = assert.rejects(surface.release(true), /restart failed.*old close failed/);
  await Promise.all([restarting, closing]);
  workspace.dispose();
});

test('automatic cleanup retains close failures from late sessions', async () => {
  const runtime = createRuntime();
  let finishStart!: (session: TerminalSessionInfo) => void;
  runtime.ensureTerminalSession = () => new Promise(resolve => { finishStart = resolve; });
  const failure = new Error('close failed');
  runtime.closeTerminalSession = async () => { throw failure; };
  const workspace = new TerminalWorkspace(runtime);
  const surface = workspace.createSurfaceSession(false, emptySurfaceHandlers());
  const starting = assert.rejects(surface.start({ repoId: 'repo-a', repoPath: 'E:/repo-a' }), error => error === failure);
  const closing = assert.rejects(surface.release(true), error => error === failure);
  finishStart({ sessionId: 'late-failure', repoId: 'repo-a', repoPath: 'E:/repo-a', shell: 'powershell', startedAt: 1 });
  await Promise.all([starting, closing]);
  workspace.dispose();
});

test('marks a repository failed when starting fails and preserves input errors', async () => {
  const runtime = createRuntime();
  runtime.ensureTerminalSession = async () => {
    throw new Error('cannot start');
  };
  const workspace = new TerminalWorkspace(runtime);

  await assert.rejects(
    workspace.ensureSession({ repoId: 'repo-a', repoPath: 'E:/repo-a' }),
    /cannot start/,
  );
  assert.equal(workspace.getSnapshot()['repo-a'], 'failed');

  runtime.ensureTerminalSession = async (request: TerminalSessionRequest) => ({
    sessionId: 'term-ok',
    repoId: request.repoId,
    repoPath: request.repoPath,
    shell: 'powershell',
    startedAt: 1,
  });
  runtime.writeTerminalInput = async () => {
    throw new Error('cannot write');
  };

  await assert.rejects(
    workspace.sendToDefaultSession({ repoId: 'repo-a', repoPath: 'E:/repo-a' }, 'git status\r'),
    /cannot write/,
  );
  assert.equal(workspace.getSnapshot()['repo-a'], 'running');
  workspace.dispose();
});

test('keeps clipboard callbacks bound to the terminal runtime', async () => {
  const runtime = createRuntime();
  runtime.readClipboardImagePath = async () => 'E:/clipboard.png';
  runtime.readClipboardText = async () => 'clipboard text';
  const workspace = new TerminalWorkspace(runtime);
  const readImagePath = workspace.readClipboardImagePath;
  const readText = workspace.readClipboardText;

  assert.equal(await readImagePath(), 'E:/clipboard.png');
  assert.equal(await readText(), 'clipboard text');
  workspace.dispose();
});

function emptySurfaceHandlers() {
  return {
    onOutput: () => undefined,
    onExit: () => undefined,
    onDeliveryFailure: () => undefined,
  };
}

test('restarts the named session without changing its repository ownership', async () => {
  const runtime = createRuntime();
  const workspace = new TerminalWorkspace(runtime);
  const session = await workspace.ensureSession({ repoId: 'repo-a', repoPath: 'E:/repo-a' });

  const replacement = await workspace.restartSession('repo-a', session.sessionId, 120, 32);

  assert.equal(replacement.sessionId, `${session.sessionId}-restart`);
  assert.equal(workspace.getSnapshot()['repo-a'], 'running');
  workspace.dispose();
});
