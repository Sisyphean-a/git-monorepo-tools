# Worktree Override

- reason: 当前仓库不在 linked execution worktree 中，需按用户明确要求修复仓库终端 session key 无条件转小写导致的大小写敏感路径误合并风险。
- scope: `terminal_manager.go`、`terminal_repo_match.go`、`terminal_repo_match_test.go`、`.codestable/goals/2026-07-04-repo-terminal-tab/functional-acceptance.md`、`.codestable/issues/2026-07-04-terminal-session-key-case/terminal-session-key-case-fix-note.md`、`.codestable/issues/2026-07-04-terminal-session-key-case/terminal-session-key-case-review.md`。
- approval: 用户在 2026-07-04 的对话中明确要求“修复风险”。
