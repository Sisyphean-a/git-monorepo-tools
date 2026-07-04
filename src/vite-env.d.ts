/// <reference types="vite/client" />

interface Window {
  go?: {
    main?: {
      App?: {
        GetSnapshot: (request: {
          scanRoots: Array<{ path: string; category: string }>;
          concurrency: number;
          pullStrategy: 'ff-only' | 'rebase' | 'merge';
          pushStrategy: 'upstream-only' | 'all';
        }) => Promise<import('./app/types').AppSnapshot>;
        MutateRepo: (
          repoId: string,
          action: string,
          request: {
            scanRoots: Array<{ path: string; category: string }>;
            concurrency: number;
            pullStrategy: 'ff-only' | 'rebase' | 'merge';
            pushStrategy: 'upstream-only' | 'all';
          },
          body: {
            fileId?: string;
            filePath?: string;
            message?: string;
            repoPath?: string;
          },
        ) => Promise<import('./app/types').AppSnapshot>;
        RunBatch: (
          operation: 'pull' | 'push',
          request: {
            scanRoots: Array<{ path: string; category: string }>;
            concurrency: number;
            pullStrategy: 'ff-only' | 'rebase' | 'merge';
            pushStrategy: 'upstream-only' | 'all';
          },
        ) => Promise<{
          snapshot: import('./app/types').AppSnapshot;
          results?: import('./app/types').PullResult[];
          operation?: 'pullAll' | 'pushAll';
        }>;
        GetRepoLog: (
          repoId: string,
          request: {
            scanRoots: Array<{ path: string; category: string }>;
            concurrency: number;
            pullStrategy: 'ff-only' | 'rebase' | 'merge';
            pushStrategy: 'upstream-only' | 'all';
          },
        ) => Promise<import('./app/types').RepoLog>;
        EnsureTerminalSession: (request: {
          repoId: string;
          repoPath: string;
          cols?: number;
          rows?: number;
        }) => Promise<import('./app/types').TerminalSessionInfo>;
        WriteTerminalInput: (sessionId: string, data: string) => Promise<void>;
        ResizeTerminal: (sessionId: string, cols: number, rows: number) => Promise<void>;
        GenerateCommitMessage: (
          repoId: string,
          request: {
            scanRoots: Array<{ path: string; category: string }>;
            concurrency: number;
            pullStrategy: 'ff-only' | 'rebase' | 'merge';
            pushStrategy: 'upstream-only' | 'all';
          },
          aiCommit: import('./app/types').AICommitSettings,
        ) => Promise<string>;
        OpenFolder: (path: string) => Promise<void>;
        OpenTerminal: (path: string) => Promise<void>;
        OpenConflicts: (path: string) => Promise<void>;
        PickFolder: () => Promise<string>;
      };
    };
  };
}
