import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureTerminalSession, fetchCommitDetail, fetchRepoHistory, fetchSnapshot, fetchWorkspaceBootstrap, generateCommitMessage, invokeLocalRepoAction, mutateRepo, refreshRepo, resizeTerminal, restartTerminalSession, runRepoCommand, writeTerminalInput, } from './api.js';
test('fetchSnapshot can opt into remote refresh after page load', async () => {
    const calls = [];
    const originalWindow = globalThis.window;
    const bindings = {
        GetWorkspaceBootstrap: async () => {
            throw new Error('unused');
        },
        GetSnapshot: async (request) => {
            calls.push({
                refreshRemotes: request.refreshRemotes,
                proxyEnabled: request.proxy.enabled,
                proxyPort: request.proxy.port,
                timeoutSeconds: request.timeoutSeconds,
            });
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
        MutateRepo: async () => {
            throw new Error('unused');
        },
        RefreshRepo: async () => {
            throw new Error('unused');
        },
        RunBatch: async () => {
            throw new Error('unused');
        },
        GetRepoLog: async () => {
            throw new Error('unused');
        },
        GetRepoHistory: async () => {
            throw new Error('unused');
        },
        GetCommitDetail: async () => {
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
        await fetchSnapshot();
        await fetchSnapshot(undefined, { refreshRemotes: true });
    }
    finally {
        Object.defineProperty(globalThis, 'window', {
            configurable: true,
            value: originalWindow,
        });
    }
    assert.deepEqual(calls, [
        { refreshRemotes: false, proxyEnabled: false, proxyPort: 7897, timeoutSeconds: 60 },
        { refreshRemotes: true, proxyEnabled: false, proxyPort: 7897, timeoutSeconds: 60 },
    ]);
});
test('fetchWorkspaceBootstrap uses dedicated binding', async () => {
    const calls = [];
    const originalWindow = globalThis.window;
    const bindings = {
        GetWorkspaceBootstrap: async (request) => {
            calls.push(request.refreshRemotes);
            return {
                repos: [],
                selectedRepoId: '',
                scannedAt: '',
                categories: [],
            };
        },
        GetSnapshot: async () => {
            throw new Error('unused');
        },
        MutateRepo: async () => {
            throw new Error('unused');
        },
        RefreshRepo: async () => {
            throw new Error('unused');
        },
        RunBatch: async () => {
            throw new Error('unused');
        },
        GetRepoLog: async () => {
            throw new Error('unused');
        },
        GetRepoHistory: async () => {
            throw new Error('unused');
        },
        GetCommitDetail: async () => {
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
        await fetchWorkspaceBootstrap();
    }
    finally {
        Object.defineProperty(globalThis, 'window', {
            configurable: true,
            value: originalWindow,
        });
    }
    assert.deepEqual(calls, [false]);
});
test('invokeLocalRepoAction does not trigger snapshot fetch', async () => {
    const calls = [];
    const originalWindow = globalThis.window;
    const bindings = {
        GetWorkspaceBootstrap: async () => {
            throw new Error('unused');
        },
        GetSnapshot: async () => {
            calls.push('GetSnapshot');
            throw new Error('should not fetch snapshot');
        },
        MutateRepo: async () => {
            throw new Error('unused');
        },
        RefreshRepo: async () => {
            throw new Error('unused');
        },
        RunBatch: async () => {
            throw new Error('unused');
        },
        GetRepoLog: async () => {
            throw new Error('unused');
        },
        GetRepoHistory: async () => {
            throw new Error('unused');
        },
        GetCommitDetail: async () => {
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
        OpenFolder: async (path) => {
            calls.push(`OpenFolder:${path}`);
        },
        OpenTerminal: async (path) => {
            calls.push(`OpenTerminal:${path}`);
        },
        OpenConflicts: async (path) => {
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
    }
    finally {
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
    const calls = [];
    const originalWindow = globalThis.window;
    const bindings = {
        GetWorkspaceBootstrap: async () => {
            throw new Error('unused');
        },
        GetSnapshot: async () => {
            calls.push('GetSnapshot');
            throw new Error('should not fetch snapshot');
        },
        MutateRepo: async () => {
            throw new Error('unused');
        },
        RefreshRepo: async () => {
            throw new Error('unused');
        },
        RunBatch: async () => {
            throw new Error('unused');
        },
        GetRepoLog: async () => {
            throw new Error('unused');
        },
        GetRepoHistory: async () => {
            throw new Error('unused');
        },
        GetCommitDetail: async () => {
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
        GenerateCommitMessage: async (repoId) => {
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
                proxy: {
                    enabled: false,
                    host: '127.0.0.1',
                    port: 7897,
                },
            },
            commandCenter: {
                combos: [],
                customCommands: [],
            },
        });
        assert.equal(message, 'feat: 统一 AI 提交生成');
    }
    finally {
        Object.defineProperty(globalThis, 'window', {
            configurable: true,
            value: originalWindow,
        });
    }
    assert.deepEqual(calls, ['GenerateCommitMessage:repo-1']);
});
test('mutateRepo accepts discard-all action', async () => {
    const calls = [];
    const originalWindow = globalThis.window;
    const bindings = {
        GetWorkspaceBootstrap: async () => {
            throw new Error('unused');
        },
        GetSnapshot: async () => {
            throw new Error('unused');
        },
        RefreshRepo: async () => {
            throw new Error('unused');
        },
        MutateRepo: async (_repoId, action) => {
            calls.push(`MutateRepo:${action}`);
            return {
                repo: {
                    id: 'repo-1',
                    name: 'repo-1',
                    branch: 'main',
                    path: '/repo/a',
                    remote: 'origin',
                    category: '测试',
                    modified: 0,
                    ahead: 0,
                    behind: 0,
                    conflicts: 0,
                    status: 'clean',
                    lastScan: '',
                    files: [],
                    stagedCount: 0,
                    unstagedCount: 0,
                    scannedAt: '',
                    history: [],
                    historyTotal: 0,
                    historyHasMore: false,
                },
                commitCandidates: [],
                scannedAt: '',
            };
        },
        RunBatch: async () => {
            throw new Error('unused');
        },
        GetRepoLog: async () => {
            throw new Error('unused');
        },
        GetRepoHistory: async () => {
            throw new Error('unused');
        },
        GetCommitDetail: async () => {
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
    }
    finally {
        Object.defineProperty(globalThis, 'window', {
            configurable: true,
            value: originalWindow,
        });
    }
    assert.deepEqual(calls, ['MutateRepo:discard-all']);
});
test('runRepoCommand uses dedicated binding with current execution settings', async () => {
    const calls = [];
    const originalWindow = globalThis.window;
    const bindings = {
        GetWorkspaceBootstrap: async () => {
            throw new Error('unused');
        },
        GetSnapshot: async () => {
            throw new Error('unused');
        },
        MutateRepo: async () => {
            throw new Error('unused');
        },
        RefreshRepo: async () => {
            throw new Error('unused');
        },
        RunBatch: async () => {
            throw new Error('unused');
        },
        GetRepoLog: async () => {
            throw new Error('unused');
        },
        GetRepoHistory: async () => {
            throw new Error('unused');
        },
        GetCommitDetail: async () => {
            throw new Error('unused');
        },
        RunRepoCommand: async ({ repoPath, command, timeoutSeconds, proxy }) => {
            calls.push({ repoPath, command, timeoutSeconds, proxyPort: proxy.port });
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
        const settings = {
            gitBehavior: {
                timeoutSeconds: 120,
                proxy: { enabled: true, host: 'proxy.test', port: 2080 },
            },
        };
        const result = await runRepoCommand('/repo/a', 'wails build', undefined, settings);
        assert.equal(result.output, 'build ok');
        assert.equal(result.exitCode, 0);
    }
    finally {
        Object.defineProperty(globalThis, 'window', {
            configurable: true,
            value: originalWindow,
        });
    }
    assert.deepEqual(calls, [{ repoPath: '/repo/a', command: 'wails build', timeoutSeconds: 120, proxyPort: 2080 }]);
});
test('terminal bindings use dedicated Wails bridge', async () => {
    const calls = [];
    const originalWindow = globalThis.window;
    const bindings = {
        GetWorkspaceBootstrap: async () => {
            throw new Error('unused');
        },
        GetSnapshot: async () => {
            throw new Error('unused');
        },
        MutateRepo: async () => {
            throw new Error('unused');
        },
        RefreshRepo: async () => {
            throw new Error('unused');
        },
        RunBatch: async () => {
            throw new Error('unused');
        },
        GetRepoLog: async () => {
            throw new Error('unused');
        },
        GetRepoHistory: async () => {
            throw new Error('unused');
        },
        GetCommitDetail: async () => {
            throw new Error('unused');
        },
        RunRepoCommand: async () => {
            throw new Error('unused');
        },
        EnsureTerminalSession: async ({ repoId, repoPath, cols, rows }) => {
            calls.push(`EnsureTerminalSession:${repoId}:${repoPath}:${cols}:${rows}`);
            return {
                sessionId: 'term-1',
                repoId,
                repoPath,
                shell: 'pwsh',
                startedAt: 1,
            };
        },
        RestartTerminalSession: async (sessionId, cols, rows) => {
            calls.push(`RestartTerminalSession:${sessionId}:${cols}:${rows}`);
            return {
                sessionId: 'term-2',
                repoId: 'repo-1',
                repoPath: '/repo/a',
                shell: 'pwsh',
                startedAt: 2,
            };
        },
        WriteTerminalInput: async (sessionId, data) => {
            calls.push(`WriteTerminalInput:${sessionId}:${data}`);
        },
        ResizeTerminal: async (sessionId, cols, rows) => {
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
    }
    finally {
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
test('refreshRepo uses dedicated binding', async () => {
    const calls = [];
    const originalWindow = globalThis.window;
    const bindings = {
        GetWorkspaceBootstrap: async () => {
            throw new Error('unused');
        },
        GetSnapshot: async () => {
            throw new Error('unused');
        },
        RefreshRepo: async (repoId, request) => {
            calls.push({
                repoId,
                repoPath: request.repoPath,
                repoCategory: request.repoCategory,
            });
            return {
                repo: {
                    id: repoId,
                    name: 'repo-1',
                    branch: 'main',
                    path: '/repo/a',
                    remote: 'origin',
                    category: '测试',
                    modified: 1,
                    ahead: 0,
                    behind: 0,
                    conflicts: 0,
                    status: 'changed',
                    lastScan: '',
                    files: [],
                    stagedCount: 0,
                    unstagedCount: 1,
                    scannedAt: '',
                    history: [],
                    historyTotal: 0,
                    historyHasMore: false,
                },
                commitCandidates: [],
                scannedAt: 'now',
            };
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
        GetRepoHistory: async () => {
            throw new Error('unused');
        },
        GetCommitDetail: async () => {
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
        const result = await refreshRepo('repo-1', undefined, undefined, { path: '/repo/a', category: '测试' });
        assert.equal(result.repo.id, 'repo-1');
        assert.equal(result.scannedAt, 'now');
    }
    finally {
        Object.defineProperty(globalThis, 'window', {
            configurable: true,
            value: originalWindow,
        });
    }
    assert.deepEqual(calls, [
        {
            repoId: 'repo-1',
            repoPath: '/repo/a',
            repoCategory: '测试',
        },
    ]);
});
test('history bindings use dedicated Wails bridge', async () => {
    const calls = [];
    const originalWindow = globalThis.window;
    const bindings = {
        GetWorkspaceBootstrap: async () => {
            throw new Error('unused');
        },
        GetSnapshot: async () => {
            throw new Error('unused');
        },
        RefreshRepo: async () => {
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
        GetRepoHistory: async (repoId, _request, offset, limit) => {
            calls.push(`GetRepoHistory:${repoId}:${offset}:${limit}`);
            return {
                repoId,
                repoName: 'repo-1',
                path: '/repo/a',
                offset,
                limit,
                total: 51,
                hasMore: true,
                commits: [{
                        hash: 'abc',
                        shortHash: 'abc',
                        author: 'Test User',
                        time: '1 hour ago',
                        message: 'feat: add history tab',
                        additions: 10,
                        deletions: 2,
                        parents: 1,
                        refs: ['main'],
                        files: 3,
                    }],
            };
        },
        GetCommitDetail: async (repoId, _request, hash) => {
            calls.push(`GetCommitDetail:${repoId}:${hash}`);
            return {
                hash,
                shortHash: 'abc',
                author: 'Test User',
                time: '1 hour ago',
                message: 'feat: add history tab',
                additions: 10,
                deletions: 2,
                parents: 1,
                refs: ['main'],
                files: 3,
                body: 'details',
                authorEmail: 'test@example.com',
                committedAt: '2026-07-06T10:00:00+08:00',
                filesChanged: ['src/app/components/repo-history-tab.tsx'],
            };
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
        const history = await fetchRepoHistory('repo-1', 50, 50);
        assert.equal(history.total, 51);
        assert.equal(history.commits[0]?.hash, 'abc');
        const detail = await fetchCommitDetail('repo-1', 'abc');
        assert.equal(detail.authorEmail, 'test@example.com');
        assert.equal(detail.filesChanged[0], 'src/app/components/repo-history-tab.tsx');
    }
    finally {
        Object.defineProperty(globalThis, 'window', {
            configurable: true,
            value: originalWindow,
        });
    }
    assert.deepEqual(calls, [
        'GetRepoHistory:repo-1:50:50',
        'GetCommitDetail:repo-1:abc',
    ]);
});
