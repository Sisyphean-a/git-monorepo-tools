---
处理方式: 调查
状态: 已关闭
认领者: ""
硬依赖: []
---

# 会话流所有权

## 问题

Pi Windows 终端的输出和退出事件应由哪个对象在何时登记、缓存、交付和清理，才能同时避免启动输出丢失、早退事件丢失与无绑定会话的无限缓存？

## 答案

Go `Manager` 从会话写入映射起拥有后端生命周期：`terminalSession` 串行写入、读取原始输出、关闭输出批次后才发送退出事件，再从映射移除会话。这样尾部启动控制序列必定先于退出事件离开后端。

前端 `TerminalWorkspace` 是 Wails 事件的唯一订阅者和按 `sessionId` 的交付所有者。尚未绑定 xterm 的会话按到达顺序暂存输出和退出码；绑定时先回放全部输出、再交付退出，并立即清理暂存。每个会话的暂存上限为 1 MiB；超过上限不会回放不完整数据，而是明确报告失败并要求重新打开终端。最后一个表面释放后，未交付数据被丢弃，后续事件不再重新缓存。

`RepoTerminalSurface` 只绑定其会话、把已交付数据写给自己的 xterm，并显示失败或退出；它不直接订阅 Wails 事件。因此仓库切换不会把一个会话的输出写进另一个会话。

## 依据

- 当前态：`.codestable/architecture/shared/terminal-runtime.md`。
- 决定：`.codestable/requirements/adrs/003-pi-windows-terminal-protocol-delivery.md`。
- 代码与确定性证据：`internal/terminal/manager.go`、`internal/terminal/manager_lifecycle_test.go`、`src/app/features/terminal/terminal-workspace.tsx`、`src/app/features/terminal/terminal-workspace.test.ts`。
