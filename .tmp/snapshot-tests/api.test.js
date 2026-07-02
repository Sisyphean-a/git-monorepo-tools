import test from 'node:test';
import assert from 'node:assert/strict';
import { generateCommitMessage, invokeLocalRepoAction, mutateRepo } from './api.js';
test('invokeLocalRepoAction does not trigger snapshot fetch', async () => {
    const calls = [];
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
        GetSnapshot: async () => {
            throw new Error('unused');
        },
        MutateRepo: async (_repoId, action) => {
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
