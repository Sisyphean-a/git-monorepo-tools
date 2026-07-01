---
doc_type: worktree-override
date: 2026-07-01
---

# worktree override

- reason: 当前仓库未运行在 linked execution worktree，中断会阻塞本次小范围界面裁剪。
- scope: 仅移除主工作区中的 diff 预览窗口及其相关前端状态，不扩展到其他功能。
- approval: 用户已在当前工作区明确要求“直接帮我移除这个窗口”。
