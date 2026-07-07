---
doc_type: issue-fix
issue: 2026-07-07-terminal-paste-duplicates
path: fast-track
fix_date: 2026-07-07
tags: [terminal, paste, xterm, windows]
---

# 终端粘贴重复上屏 修复记录

## 1. 问题描述

终端里执行一次粘贴后，剪切板内容会连续出现两遍。`Ctrl+V` 和直接把剪切板内容上屏时都可能复现。

## 2. 根因

终端组件在 Windows 快捷键分支里手动处理了 `Ctrl+V`，会主动调用一次 `terminal.paste(...)`。但 `xterm` 自身本来就会响应浏览器的原生粘贴事件，再走一次内部粘贴流程，所以一次操作变成了两次上屏。

## 3. 修复方案

删除 `Ctrl+V` 的手动拦截，只保留 `Ctrl+C` 选区复制的自定义处理。粘贴改回走 `xterm` 默认链路，右键无选区时的显式粘贴逻辑继续保留。

## 4. 改动文件清单

- `src/app/components/repo-terminal-shortcuts.ts`
- `src/app/components/repo-terminal-shortcuts.test.ts`
- `src/app/components/repo-terminal-surface.tsx`

## 5. 验证结果

- 单测校验 Windows 下 `Ctrl+C` 有选区仍走复制，无选区仍放行默认行为。
- 单测校验 Windows 下 `Ctrl+V` 改为放行，避免和 `xterm` 自带粘贴重复执行。
- 运行 `npm run test:snapshot-coordinator`，现有测试全部通过。

## 6. 遗留事项

无。
