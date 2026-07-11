---
unit: 2026-07-10-terminal-shift-enter
reason: preserve-existing-terminal-changes
scope: terminal-shift-enter
approval: user-confirmed-2026-07-10
---

# 执行工作树例外

## Reason

当前检出已包含用户此前确认的终端 Ctrl+V 修复未提交改动。用户已确认开始本功能实现，
因此在当前目录增量执行，避免移动或遗漏已有改动。

## Scope

仅修改 Windows Shift+Enter 所需的终端快捷键、终端输入队列接通、PowerShell 启动配置及其测试。

## Approval

用户于 2026-07-10 确认开始实现本 feature。
