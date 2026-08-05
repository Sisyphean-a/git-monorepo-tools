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
  const output: string[] = [];
  const exits: number[] = [];
  const subscription = workspace.subscribeSession(chunk => output.push(chunk), code => exits.push(code));

  const defaultSession = await workspace.ensureSession({ repoId: 'repo-a', repoPath: 'E:/repo-a' });
  const independentSession = await workspace.createSession({ repoId: 'repo-a', repoPath: 'E:/repo-a' });
  subscription.bindSession(independentSession.sessionId);

  assert.equal(runtime.sessionRequests.length, 2);
  assert.equal(workspace.getSnapshot()['repo-a'], 'running');

  runtime.emit('repo-terminal-output', { sessionId: independentSession.sessionId, chunk: 'hello' });
  assert.deepEqual(output, ['hello']);
  assert.equal(workspace.getSnapshot()['repo-a'], 'active');

  runtime.emit('repo-terminal-exit', { sessionId: independentSession.sessionId, exitCode: 7 });
  assert.deepEqual(exits, [7]);
  assert.equal(workspace.getSnapshot()['repo-a'], 'running');

  await workspace.closeSession(defaultSession.sessionId);
  assert.deepEqual(runtime.closedSessionIDs, [defaultSession.sessionId]);
  subscription.dispose();
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

test('releases independent sessions, including a session that starts after disposal', async () => {
  const runtime = createRuntime();
  const workspace = new TerminalWorkspace(runtime);
  const independent = workspace.createSurfaceSession(true);
  const independentSession = await independent.start({ repoId: 'repo-a', repoPath: 'E:/repo-a' });
  assert.ok(independentSession);
  await independent.release();
  assert.deepEqual(runtime.closedSessionIDs, [independentSession.sessionId]);

  const defaultSession = workspace.createSurfaceSession(false);
  await defaultSession.start({ repoId: 'repo-a', repoPath: 'E:/repo-a' });
  await defaultSession.release();
  assert.deepEqual(runtime.closedSessionIDs, [independentSession.sessionId]);

  let resolveStart!: (session: TerminalSessionInfo) => void;
  const delayed = new Promise<TerminalSessionInfo>(resolve => {
    resolveStart = resolve;
  });
  runtime.createTerminalSession = async () => delayed;
  const delayedSession = workspace.createSurfaceSession(true);
  const starting = delayedSession.start({ repoId: 'repo-b', repoPath: 'E:/repo-b' });
  await delayedSession.release();
  resolveStart({
    sessionId: 'term-delayed',
    repoId: 'repo-b',
    repoPath: 'E:/repo-b',
    shell: 'powershell',
    startedAt: 3,
  });

  assert.equal(await starting, null);
  assert.deepEqual(runtime.closedSessionIDs, [independentSession.sessionId, 'term-delayed']);

  let resolveDefaultStart!: (session: TerminalSessionInfo) => void;
  const delayedDefaultStart = new Promise<TerminalSessionInfo>(resolve => {
    resolveDefaultStart = resolve;
  });
  runtime.ensureTerminalSession = async () => delayedDefaultStart;
  const delayedDefault = workspace.createSurfaceSession(false);
  const startingDefault = delayedDefault.start({ repoId: 'repo-c', repoPath: 'E:/repo-c' });
  await delayedDefault.release();
  resolveDefaultStart({
    sessionId: 'term-default-delayed',
    repoId: 'repo-c',
    repoPath: 'E:/repo-c',
    shell: 'powershell',
    startedAt: 4,
  });

  assert.equal(await startingDefault, null);
  runtime.emit('repo-terminal-output', { sessionId: 'term-default-delayed', chunk: 'must not cache after release' });
  const abandonedOutput: string[] = [];
  const abandonedSubscription = workspace.subscribeSession(chunk => abandonedOutput.push(chunk), () => {});
  abandonedSubscription.bindSession('term-default-delayed');
  assert.deepEqual(abandonedOutput, []);
  abandonedSubscription.dispose();
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

test('restarts the named session without changing its repository ownership', async () => {
  const runtime = createRuntime();
  const workspace = new TerminalWorkspace(runtime);
  const session = await workspace.ensureSession({ repoId: 'repo-a', repoPath: 'E:/repo-a' });

  const replacement = await workspace.restartSession('repo-a', session.sessionId, 120, 32);

  assert.equal(replacement.sessionId, `${session.sessionId}-restart`);
  assert.equal(workspace.getSnapshot()['repo-a'], 'running');
  workspace.dispose();
});
