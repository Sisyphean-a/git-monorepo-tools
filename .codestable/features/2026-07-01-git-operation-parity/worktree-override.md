# Worktree Override

- reason: 当前仓库不在 linked execution worktree 中，需按用户明确要求直接移除首屏静态快照。
- scope: `src/app/App.tsx`、`src/app/api.ts`、`package.json`，删除 `src/app/data.ts`。
- approval: 用户在 2026-07-01 的对话中明确要求“就是假数据嘛，不需要首屏占位快照，移除它”。
