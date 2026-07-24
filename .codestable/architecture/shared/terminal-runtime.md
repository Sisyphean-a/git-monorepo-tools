# 终端运行时

- scope: workspace

## 契约

- 一个仓库路径在同一应用进程只复用一个终端会话；`EnsureTerminalSession` 返回现有会话或创建新会话，`RestartTerminalSession` 替换指定会话。
- 终端输入按会话串行写入；会话结束、未知会话和启动失败必须显式报错。
- 后端把终端输出合并为批次再通过 `repo-terminal-output` 事件发送，关闭时先发送尾部内容；前端按 `sessionId` 映射仓库状态，不能把旧会话事件写入新会话。
- 应用关闭时终止全部会话；Windows ConPTY 进程放入 kill-on-close Job，避免遗留子进程。

## 代码锚点

`internal/terminal/manager.go`、`internal/terminal/output_batcher.go`、`internal/terminal/host_windows.go`、`app.go`、`src/app/features/terminal/repo-terminal-status.ts`、`src/app/features/terminal/terminal-event-bus.ts`。
