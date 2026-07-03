---
doc_type: issue-fix
issue: 2026-07-03-sidebar-refresh-terminal-batch-order
path: fast-track
fix_date: 2026-07-03
tags: [frontend, desktop, wails, sidebar, batch-operation]
---

# 侧边栏刷新反馈、终端自动关闭、批量结果排序 修复记录

## 1. 问题描述

- 侧边栏底部“扫描”按钮点击后没有 loading 反馈，看起来像没响应。
- 右上角“终端”按钮会拉起一个终端窗口，但窗口会很快自己关闭。
- 批量 Pull / Push 结果面板仍按仓库原始顺序展示，真正有动作或有异常的仓库容易被埋在后面。

## 2. 根因

- 侧边栏刷新直接调用快照刷新，没有单独维护“手动刷新中”的前端状态，所以按钮始终是静态文案。
- 终端按钮原先走 PowerShell 交互窗口路径，实机上仍会闪退；单靠切换 PowerShell 启动参数不够稳。
- 批量结果抽屉直接遍历原始 `results` 数组，没有任何排序层，导致“已拉取 / 已推送 / 失败 / 跳过”与“无变化”混在一起。

## 3. 修复方案

- 给侧边栏补一个独立的手动刷新状态；点击后按钮立刻切成 spinner 和“扫描中…”，完成后恢复。
- 终端启动改成优先拉起 Windows Terminal（`wt.exe -d <path>`）；如果系统侧没法用，再退回 `cmd.exe /K` 在目标目录保活窗口。
- 批量结果面板新增纯函数排序：失败优先，其次是已拉取/已推送，再是跳过，最后才是已同步；同类结果里按提交数倒序，其余保持原顺序。

## 4. 改动文件清单

- `src/app/App.tsx`：新增侧边栏手动刷新状态，并把刷新按钮接到新的 loading 流程。
- `src/app/components/sidebar.tsx`：给“扫描”按钮补 disabled / spinner / 文案切换。
- `src/app/components/pull-all-drawer.tsx`：结果列表和复制报告统一改用排序后的数组。
- `src/app/pull-results.ts`：新增批量结果排序 helper。
- `src/app/pull-results.test.ts`：补排序回归测试。
- `desktop.go`：终端改为 Windows Terminal 优先、`cmd.exe` 兜底；冲突工具仍保留 PowerShell 交互方式。
- `desktop_process_windows.go` / `desktop_process_other.go`：保留交互式控制台进程属性辅助代码。
- `desktop_test.go` / `desktop_process_windows_test.go`：补 Windows Terminal / cmd 启动参数与控制台属性测试。
- `package.json`、`tsconfig.snapshot-tests.json`：把新测试纳入现有前端测试命令。
- `.codestable/issues/2026-07-03-sidebar-refresh-terminal-batch-order/worktree-override.md`

## 5. 验证结果

- `go test ./...` 通过。
- `npm run test:snapshot-coordinator` 通过，新增批量结果排序测试已覆盖。
- `npm run web:build` 通过。
- 本机探针：`Start-Process wt.exe -ArgumentList '-d','E:\\github\\git-monorepo-tools'` 可成功拉起 `WindowsTerminal` 进程。

## 6. 遗留事项

- 终端按钮最终仍需在 Wails 桌面窗口里手点一次确认，但本轮已切到实机可拉起 `WindowsTerminal` 的入口，不再继续依赖会闪退的 PowerShell 路径。
