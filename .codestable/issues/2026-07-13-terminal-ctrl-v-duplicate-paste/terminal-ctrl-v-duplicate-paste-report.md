---
doc_type: issue-report
issue: 2026-07-13-terminal-ctrl-v-duplicate-paste
status: confirmed
severity: P1
summary: Windows 终端按 Ctrl+V 后剪贴板内容被写入两次
tags: [terminal, paste, windows, wails, xterm]
---

# 终端 Ctrl+V 重复粘贴 Issue Report

## 1. 问题现象

Windows Wails 桌面端的仓库终端中，按一次 Ctrl+V 后，同一段剪贴板内容连续出现两遍。

## 2. 复现步骤

1. 在 Windows 桌面端打开任意仓库终端。
2. 复制一段文本。
3. 在终端中按一次 Ctrl+V。
4. 观察到剪贴板文本被写入两次。

## 3. 期望行为

按一次 Ctrl+V 只向当前终端会话写入一次剪贴板内容。

## 4. 根因与修复范围

`attachCustomKeyEventHandler` 返回 `false` 只停止 xterm 的键盘处理，不会阻止浏览器默认行为。当前代码同时执行应用剪贴板粘贴和浏览器原生 paste 链路，导致双写。

本次仅修正自定义快捷键的默认事件处理，并补充回归测试。
