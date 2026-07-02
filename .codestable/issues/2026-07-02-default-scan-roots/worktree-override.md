# Worktree Override

- reason: 当前仓库不在 linked execution worktree 中，需按用户明确要求直接修复默认扫描根导致仓库被自动加入的问题。
- scope: `snapshot/service.go`、`snapshot/service_test.go`、`scripts/sync-real-data.mjs`、`src/app/components/settings-modal.tsx`、`.codestable/issues/2026-07-02-default-scan-roots/default-scan-roots-fix-note.md`、`.codestable/issues/2026-07-02-default-scan-roots/default-scan-roots-review.md`。
- approval: 用户在 2026-07-02 的对话中明确要求移除默认扫描，并表示用户不添加时不要自己添加。
