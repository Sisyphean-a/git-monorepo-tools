---
doc_type: issue-fix
issue: 2026-07-13-terminal-ctrl-v-duplicate-paste
status: confirmed
path: fast-track
fix_date: 2026-07-13
tags: [terminal, paste, windows, wails, xterm]
---

# 终端 Ctrl+V 重复粘贴修复记录

## 1. 问题描述

Windows Wails 桌面端的仓库终端中，按一次 Ctrl+V 后，同一段剪贴板内容被写入两次。

## 2. 根因

应用通过 xterm 的 `attachCustomKeyEventHandler` 捕获 Ctrl+V，读取系统剪贴板并主动粘贴。处理函数只返回 `false`，这只会停止 xterm 的键盘解析，不会阻止浏览器默认行为；浏览器随后仍派发原生 paste 事件，xterm 再写入一次。

## 3. 修复方案

仅在 Ctrl+V 被应用消费时显式调用 `KeyboardEvent.preventDefault()`，同时继续返回 `false`。Ctrl+V 因此只走应用剪贴板链路；Ctrl+C 和 Shift+Enter 保持原有默认事件语义。

## 4. 改动文件

- `src/app/components/repo-terminal-shortcuts.ts`
- `src/app/components/repo-terminal-shortcuts.test.ts`
- `.tmp/snapshot-tests/components/repo-terminal-shortcuts.js`
- `.tmp/snapshot-tests/components/repo-terminal-shortcuts.test.js`
- `.codestable/attention.md`

## 5. 验证结果

- `npm run test:snapshot-coordinator`：47 项测试全部通过。
- `npm run web:build`：通过。
- `go test ./...`：通过；首次运行因 worktree 缺少 Go embed 所需的 `dist` 显式失败，执行真实前端构建后重跑通过。
- `npm run wails:build`：Windows 生产构建通过。
- `git diff --check`：通过。

## 6. 遗留风险

自动化测试已确认 Ctrl+V 会调用一次应用粘贴并阻止默认事件。Wails WebView2 的真实系统剪贴板事件仍需桌面端手工复核，但代码已切断已确认的第二条原生 paste 写入链路。
