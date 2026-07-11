---
doc_type: issue-fix
issue: 2026-07-10-terminal-ctrl-v-paste
status: confirmed
path: fast-track
fix_date: 2026-07-10
tags: [terminal, paste, windows, wails]
---

# 终端 Ctrl+V 无法粘贴 修复记录

## 1. 问题描述

Windows 终端的 Ctrl+V 无法粘贴，而右键粘贴正常。

## 2. 根因

之前为避免重复粘贴而移除了 Ctrl+V 的显式处理，改为依赖终端库的默认粘贴链路。该链路在 Wails 桌面端没有读取系统剪贴板，因此按键被放行后没有内容写入终端。

## 3. 修复方案

Windows 下的 Ctrl+V 现在显式读取系统剪贴板并阻止默认处理。终端先按自身的粘贴协议转换内容，再在已预留的输入队列位置写入会话；右键与快捷键复用同一粘贴和提示逻辑。

## 4. 改动文件清单

- `src/app/components/repo-terminal-shortcuts.ts`
- `src/app/components/repo-terminal-shortcuts.test.ts`
- `src/app/components/repo-terminal-surface.tsx`
- `.tmp/snapshot-tests/components/repo-terminal-shortcuts.js`
- `.tmp/snapshot-tests/components/repo-terminal-shortcuts.test.js`

## 5. 验证结果

- `npx tsc -p tsconfig.snapshot-tests.json --noEmit`：通过。
- `npm run test:snapshot-coordinator`：35 项测试全部通过。
- `npm run wails:build`：Windows 生产构建通过。
- 快捷键测试确认 Ctrl+V 会触发应用粘贴并阻止默认处理；粘贴测试确认终端转换后的多行和 bracketed paste 内容会被完整写入。
- 本次改动的 `git diff --check` 通过。

## 6. 遗留事项

需要在 Windows 桌面端手工确认 Ctrl+V 和右键的单次粘贴、空剪贴板和读取失败提示；自动化测试无法模拟 Wails 原生剪贴板事件。
