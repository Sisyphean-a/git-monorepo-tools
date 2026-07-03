# Worktree Override

- reason: 当前仓库不在 linked execution worktree 中，需按用户明确反馈直接修复自定义命令输出把 ANSI 控制码原样显示成乱码的问题。
- scope: `snapshot/command_runner.go`、`snapshot/command_runner_test.go`、`.codestable/issues/2026-07-03-custom-command-ansi-output/custom-command-ansi-output-fix-note.md`。
- approval: 用户在 2026-07-03 的对话中明确反馈“自定义命令，输出会乱码”，并附带 `wails build` 面板截图要求排查修复。
