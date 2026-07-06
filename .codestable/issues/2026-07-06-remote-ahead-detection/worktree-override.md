reason: 当前仓库未运行在 linked execution worktree 中，但用户明确要求直接修复“启动或自动扫描时无法主动感知远端新提交，只有 VS Code 先触发检查后才显示可 pull”的现存 bug。
scope: 仅修改 `snapshot/` 下仓库扫描与测试、`scripts/sync-real-data.mjs` 镜像实现，以及本 issue 对应文档。
approval: 用户在 2026-07-06 的对话中确认根因判断与修复方案，并明确回复“可以，改吧”。
