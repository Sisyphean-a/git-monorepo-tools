import test from 'node:test';
import assert from 'node:assert/strict';
import { invokeLocalRepoAction } from './api.js';
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
        GenerateCommitCandidates: async () => {
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
