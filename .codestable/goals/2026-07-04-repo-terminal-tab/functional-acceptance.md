---
doc_type: functional-acceptance
goal: repo-terminal-tab
verdict: pass
reviewer: subagent
updated_at: "2026-07-04"
---

# 功能验收

## Scope

验收范围是主工作区中部区域新增的“终端”Tab、仓库级持久化终端 session、Windows ConPTY 路径，以及应用关闭时的统一清理行为。

## Acceptance Checks

- 主工作区顶部新增“终端”Tab，并能在当前仓库目录显示交互式终端。
- Windows 路径使用真实 ConPTY，支持 PowerShell / pwsh、Ctrl+C、方向键、彩色输出和 resize。
- 每个仓库拥有独立 terminal session；切换仓库或切换“变更 / 历史 / 终端”Tab 都不会销毁已创建会话。
- 关闭应用时统一清理所有终端进程。
- 完成自动化验证与独立功能验收。

## Functional Evidence

- 独立功能验收子代理 `019f2b08-a272-7930-a796-2be785ec4b64` 给出 `pass`，并已关闭。
- `Workspace` 顶部已新增“终端”Tab；原头部“终端”按钮改为切到该 Tab，不再拉起外部终端窗口。
- 后端 `terminalManager` 以仓库路径复用 session；前端 `RepoTerminalTab` 会保留各仓库的 `RepoTerminalSurface`，切仓和切 Tab 都不会卸载既有终端。
- Windows 终端 host 使用 `github.com/charmbracelet/x/conpty`；关闭链路通过 Job Object 的 `KILL_ON_JOB_CLOSE` 回收整棵终端进程树。
- 终端前端桥接基于 `xterm.js` 和 fit addon，输入、输出、彩色 ANSI、方向键和 resize 事件都走真实 PTY 流程。
- `go test -run TestTerminalManager -v` 已覆盖仓库 cwd、session 复用、`Ctrl+C` 中断后继续执行命令，以及 `CloseAll()` 退出事件。
- `npm run test:snapshot-coordinator`、`go test ./...`、`npm run web:build`、`npm run build` 全部通过。

## Verdict

通过。

## Residual Risks

无阻塞残余风险。

## Follow-up

跨应用重启后的终端恢复仍未实现，但这属于后续功能扩 scope，不是本次缺陷。

## Final Iteration

最终验收对应 `iterations/001.md`。
