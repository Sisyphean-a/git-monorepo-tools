---
doc_type: issue-report
issue: 2026-07-10-terminal-ctrl-v-paste
status: confirmed
severity: P1
summary: Windows 终端中 Ctrl+V 无法粘贴剪贴板内容
tags: [terminal, paste, windows, wails]
---

# 终端 Ctrl+V 无法粘贴 Issue Report

## 1. 问题现象

仓库终端中按 Ctrl+V 无法粘贴剪贴板内容；右键粘贴可以正常使用。

## 2. 复现步骤

1. 在 Windows 桌面端打开任意仓库终端。
2. 复制一段文本后，在终端中按 Ctrl+V。
3. 观察到：终端没有写入剪贴板内容。

复现频率：稳定。

## 3. 期望 vs 实际

**期望行为**：按 Ctrl+V 后，剪贴板文本写入终端。

**实际行为**：按 Ctrl+V 后没有内容写入；右键粘贴正常。

## 4. 环境信息

- 涉及模块 / 功能：仓库终端
- 运行环境：Windows Wails 桌面端
- 其他上下文：无

## 5. 严重程度

**P1** — 终端的常用输入方式失效，但可以通过右键粘贴绕过。
