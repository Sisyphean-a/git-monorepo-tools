# Worktree Override

- reason: 当前检出位于 `master`，项目 attention 默认禁止创建独立 worktree；用户已明确要求实施本次优化。
- scope: 后端单文件 diff 热路径、前端 diff 缓存与渲染、对应测试和本 issue 闭环文档。
- approval: 用户在 2026-07-15 的对话中确认诊断与优化方向，并要求直接实现。
