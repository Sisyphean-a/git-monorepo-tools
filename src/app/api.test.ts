import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ensureTerminalSession,
  generateCommitMessage,
  invokeLocalRepoAction,
  mutateRepo,
  resizeTerminal,
  restartTerminalSession,
  runRepoCommand,
  writeTerminalInput,
} from './api.js';

test('invokeLocalRepoAction does not trigger snapshot fetch', async () => {
  const calls: string[] = [];
  const originalWindow = globalThis.window;

  const bindings = {
    GetSnapshot: async () => {
      calls.push('GetSnapshot');
      throw new Error('should not fetch snapshot');
    },
    MutateRepo: async () => {
      throw new Error('unused');
    },
    RunBatch: async () => {
      throw new Error('unused');
    },
    GetRepoLog: async () => {
      throw new Error('unused');
    },
    RunRepoCommand: async () => {
      throw new Error('unused');
    },
    EnsureTerminalSession: async () => {
      throw new Error('unused');
    },
    RestartTerminalSession: async () => {
      throw new Error('unused');
    },
    WriteTerminalInput: async () => {
      throw new Error('unused');
    },
    ResizeTerminal: async () => {
      throw new Error('unused');
    },
    GenerateCommitMessage: async () => {
      throw new Error('unused');
    },
    OpenFolder: async (path: string) => {
      calls.push(`OpenFolder:${path}`);
    },
    OpenTerminal: async (path: string) => {
      calls.push(`OpenTerminal:${path}`);
    },
    OpenConflicts: async (path: string) => {
      calls.push(`OpenConflicts:${path}`);
    },
    PickFolder: async () => '',
  };

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { go: { main: { App: bindings } } },
  });

  try {
    await invokeLocalRepoAction('open-folder', '/repo/a');
    await invokeLocalRepoAction('open-terminal', '/repo/b');
    await invokeLocalRepoAction('open-conflicts', '/repo/c');
  } finally {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow,
    });
  }

  assert.deepEqual(calls, [
    'OpenFolder:/repo/a',
    'OpenTerminal:/repo/b',
    'OpenConflicts:/repo/c',
  ]);
});

test('generateCommitMessage uses dedicated binding', async () => {
  const calls: string[] = [];
  const originalWindow = globalThis.window;

  const bindings = {
    GetSnapshot: async () => {
      calls.push('GetSnapshot');
      throw new Error('should not fetch snapshot');
    },
    MutateRepo: async () => {
      throw new Error('unused');
    },
    RunBatch: async () => {
      throw new Error('unused');
    },
    GetRepoLog: async () => {
      throw new Error('unused');
    },
    RunRepoCommand: async () => {
      throw new Error('unused');
    },
    EnsureTerminalSession: async () => {
      throw new Error('unused');
    },
    RestartTerminalSession: async () => {
      throw new Error('unused');
    },
    WriteTerminalInput: async () => {
      throw new Error('unused');
    },
    ResizeTerminal: async () => {
      throw new Error('unused');
    },
    GenerateCommitMessage: async (repoId: string) => {
      calls.push(`GenerateCommitMessage:${repoId}`);
      return 'feat: 统一 AI 提交生成';
    },
    OpenFolder: async () => {
      throw new Error('unused');
    },
    OpenTerminal: async () => {
      throw new Error('unused');
    },
    OpenConflicts: async () => {
      throw new Error('unused');
    },
    PickFolder: async () => '',
  };

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { go: { main: { App: bindings } } },
  });

  try {
    const message = await generateCommitMessage('repo-1', {
      scanRoots: [],
      customCategories: [],
      aiCommit: {
        apiKey: 'sk-test',
        baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-chat',
        maxDiffChars: 8000,
        generateThree: false,
        stagedOnly: true,
        promptTemplate: '',
      },
      gitBehavior: {
        autoScanEnabled: true,
        autoScanIntervalSeconds: 60,
        pullStrategy: 'ff-only',
        pushStrategy: 'upstream-only',
        concurrency: 5,
        timeoutSeconds: 60,
      },
      commandCenter: {
        combos: [],
        customCommands: [],
      },
    });
    assert.equal(message, 'feat: 统一 AI 提交生成');
  } finally {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow,
    });
  }

  assert.deepEqual(calls, ['GenerateCommitMessage:repo-1']);
});

test('mutateRepo accepts discard-all action', async () => {
  const calls: string[] = [];
  const originalWindow = globalThis.window;

  const bindings = {
    GetSnapshot: async () => {
      throw new Error('unused');
    },
    MutateRepo: async (_repoId: string, action: string) => {
      calls.push(`MutateRepo:${action}`);
      return {
        scannedAt: '',
        categories: [],
        repos: [],
        repoDetails: {},
        selectedRepoId: '',
        pullResults: [],
        commitCandidates: {},
      };
    },
    RunBatch: async () => {
      throw new Error('unused');
    },
    GetRepoLog: async () => {
      throw new Error('unused');
    },
    RunRepoCommand: async () => {
      throw new Error('unused');
    },
    EnsureTerminalSession: async () => {
      throw new Error('unused');
    },
    RestartTerminalSession: async () => {
      throw new Error('unused');
    },
    WriteTerminalInput: async () => {
      throw new Error('unused');
    },
    ResizeTerminal: async () => {
      throw new Error('unused');
    },
    GenerateCommitMessage: async () => {
      throw new Error('unused');
    },
    OpenFolder: async () => {
      throw new Error('unused');
    },
    OpenTerminal: async () => {
      throw new Error('unused');
    },
    OpenConflicts: async () => {
      throw new Error('unused');
    },
    PickFolder: async () => '',
  };

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { go: { main: { App: bindings } } },
  });

  try {
    await mutateRepo('repo-1', 'discard-all', undefined, { repoPath: '/repo/a' });
  } finally {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow,
    });
  }

  assert.deepEqual(calls, ['MutateRepo:discard-all']);
});

test('runRepoCommand uses dedicated binding', async () => {
  const calls: string[] = [];
  const originalWindow = globalThis.window;

  const bindings = {
    GetSnapshot: async () => {
      throw new Error('unused');
    },
    MutateRepo: async () => {
      throw new Error('unused');
    },
    RunBatch: async () => {
      throw new Error('unused');
    },
    GetRepoLog: async () => {
      throw new Error('unused');
    },
    RunRepoCommand: async ({ repoPath, command }: { repoPath: string; command: string }) => {
      calls.push(`RunRepoCommand:${repoPath}:${command}`);
      return {
        repoPath,
        command,
        output: 'build ok',
        exitCode: 0,
        startedAt: 1,
        endedAt: 2,
      };
    },
    EnsureTerminalSession: async () => {
      throw new Error('unused');
    },
    RestartTerminalSession: async () => {
      throw new Error('unused');
    },
    WriteTerminalInput: async () => {
      throw new Error('unused');
    },
    ResizeTerminal: async () => {
      throw new Error('unused');
    },
    GenerateCommitMessage: async () => {
      throw new Error('unused');
    },
    OpenFolder: async () => {
      throw new Error('unused');
    },
    OpenTerminal: async () => {
      throw new Error('unused');
    },
    OpenConflicts: async () => {
      throw new Error('unused');
    },
    PickFolder: async () => '',
  };

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { go: { main: { App: bindings } } },
  });

  try {
    const result = await runRepoCommand('/repo/a', 'wails build');
    assert.equal(result.output, 'build ok');
    assert.equal(result.exitCode, 0);
  } finally {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow,
    });
  }

  assert.deepEqual(calls, ['RunRepoCommand:/repo/a:wails build']);
});

test('terminal bindings use dedicated Wails bridge', async () => {
  const calls: string[] = [];
  const originalWindow = globalThis.window;

  const bindings = {
    GetSnapshot: async () => {
      throw new Error('unused');
    },
    MutateRepo: async () => {
      throw new Error('unused');
    },
    RunBatch: async () => {
      throw new Error('unused');
    },
    GetRepoLog: async () => {
      throw new Error('unused');
    },
    RunRepoCommand: async () => {
      throw new Error('unused');
    },
    EnsureTerminalSession: async ({ repoId, repoPath, cols, rows }: { repoId: string; repoPath: string; cols?: number; rows?: number }) => {
      calls.push(`EnsureTerminalSession:${repoId}:${repoPath}:${cols}:${rows}`);
      return {
        sessionId: 'term-1',
        repoId,
        repoPath,
        shell: 'pwsh',
        startedAt: 1,
      };
    },
    RestartTerminalSession: async (sessionId: string, cols: number, rows: number) => {
      calls.push(`RestartTerminalSession:${sessionId}:${cols}:${rows}`);
      return {
        sessionId: 'term-2',
        repoId: 'repo-1',
        repoPath: '/repo/a',
        shell: 'pwsh',
        startedAt: 2,
      };
    },
    WriteTerminalInput: async (sessionId: string, data: string) => {
      calls.push(`WriteTerminalInput:${sessionId}:${data}`);
    },
    ResizeTerminal: async (sessionId: string, cols: number, rows: number) => {
      calls.push(`ResizeTerminal:${sessionId}:${cols}:${rows}`);
    },
    GenerateCommitMessage: async () => {
      throw new Error('unused');
    },
    OpenFolder: async () => {
      throw new Error('unused');
    },
    OpenTerminal: async () => {
      throw new Error('unused');
    },
    OpenConflicts: async () => {
      throw new Error('unused');
    },
    PickFolder: async () => '',
  };

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { go: { main: { App: bindings } } },
  });

  try {
    const session = await ensureTerminalSession('repo-1', '/repo/a', 120, 40);
    assert.equal(session.sessionId, 'term-1');
    const restarted = await restartTerminalSession('term-1', 132, 44);
    assert.equal(restarted.sessionId, 'term-2');
    await writeTerminalInput('term-2', 'git status\r');
    await resizeTerminal('term-2', 140, 50);
  } finally {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow,
    });
  }

  assert.deepEqual(calls, [
    'EnsureTerminalSession:repo-1:/repo/a:120:40',
    'RestartTerminalSession:term-1:132:44',
    'WriteTerminalInput:term-2:git status\r',
    'ResizeTerminal:term-2:140:50',
  ]);
});
