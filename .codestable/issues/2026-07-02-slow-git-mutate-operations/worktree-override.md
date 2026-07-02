# Worktree Override

- reason: 当前仓库不在 linked execution worktree 中，需按用户明确要求直接修复提交与暂存操作的性能问题。
- scope: `snapshot/repo_resolution.go`、`snapshot/operations.go`、`snapshot/types.go`、`snapshot/operations_test.go`、`snapshot/benchmark_test.go`、`src/app/api.ts`、`src/app/components/workspace.tsx`、`scripts/sync-real-data.mjs`、`.codestable/issues/2026-07-02-slow-git-mutate-operations/slow-git-mutate-operations-fix-note.md`、`.codestable/issues/2026-07-02-slow-git-mutate-operations/slow-git-mutate-operations-review.md`。
- approval: 用户在 2026-07-02 的对话中明确确认快速通道方案，并要求后续无需再次确认、持续工作直到完成。
