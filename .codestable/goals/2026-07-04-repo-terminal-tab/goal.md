---
doc_type: goal
goal: repo-terminal-tab
status: complete
---

# 仓库级持久化终端 Tab

## Objective

在当前项目主工作区中新增仓库级持久化终端 Tab，让用户能直接在所选仓库根目录下打开并持续使用交互式终端，覆盖 `codex`、`pnpm`、`git` 等 CLI 工作流。

## Starting Point

当前主工作区只有“变更”和“历史”两个 Tab。头部现有“终端”按钮只是调用桌面桥接拉起系统外部终端，不存在内嵌终端、仓库级 session 管理、Tab 切换保活或应用退出统一清理。

## Acceptance Criteria

- 主工作区顶部新增“终端”Tab，并能在当前仓库目录显示交互式终端。
- Windows 必须使用真实 ConPTY，而不是普通 stdout/stderr pipe。
- 终端支持 PowerShell / pwsh、交互式 CLI、Ctrl+C、方向键、彩色输出和窗口 resize。
- 每个仓库拥有独立 terminal session；切换仓库或切换“变更 / 历史 / 终端”Tab 都不会销毁已创建会话。
- 关闭应用时统一清理所有终端进程。
- 通过独立功能验收后再关闭 goal。

## Non-Goals

- 不重做现有变更、历史和 AI 提交区域的整体布局。
- 不新增终端设置页、shell 切换器或高级主题配置。
- 不扩展为多终端标签、分屏或远程终端。

## Decisions And Assumptions

- owner 已明确指定：Windows 路径必须走 ConPTY，前端采用 xterm.js。
- 仓库级持久化优先于“一仓库可开多个终端实例”；本轮按每仓库单一持久会话实现。
- 现有头部“终端”入口会调整为进入内嵌终端工作流，而不是继续依赖外部窗口。
- 非 Windows 平台保持 PTY 语义即可，但本轮验收重点是 Windows 桌面行为。

## Current State

后端 PTY/ConPTY session manager、Wails 事件桥接、前端持久化 xterm 面板和工作区新 Tab 已全部落地。自动化验证、独立功能验收和关闭时清理链路均已完成，本 goal 的 done signal 已满足。

## Next Action

无。goal 已完成。
