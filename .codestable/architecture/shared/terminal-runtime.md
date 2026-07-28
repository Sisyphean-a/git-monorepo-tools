# 终端运行时

- scope: workspace

## 契约

- 默认终端按仓库路径复用会话：`EnsureTerminalSession` 返回现有会话或创建新会话。用户新增的终端标签调用 `CreateTerminalSession`，即使同一仓库已有终端也必须创建独立会话；独立标签只在创建它的仓库处展示，切换仓库时不得复用或展示其他仓库的会话。工作区主标签的选择按仓库独立保留，首次打开仓库默认展示“变更”，切回仓库时恢复该仓库此前选择。关闭独立终端标签调用 `CloseTerminalSession` 时，必须先让会话不再可复用，再终止对应进程。`RestartTerminalSession` 只替换指定会话。
- 终端输入按会话串行写入；会话结束、未知会话和启动失败必须显式报错。
- Windows 粘贴先用原生剪贴板格式检查图片；仅检测到图片时才启动隐藏的 PowerShell，将它落为 `%TEMP%/pi-clipboard-*.png` 并按输入队列写入终端。没有图片时不启动子进程，直接保留 xterm 的文本粘贴转换。`Ctrl+V`、`Alt+V`、`Shift+Enter` 与 `Ctrl+J` 的 Pi 输入协议由前端显式转换后写入同一队列。
- 后端把终端输出合并为批次再通过 `repo-terminal-output` 事件发送，关闭时先发送尾部内容；前端按 `sessionId` 映射会话并按仓库聚合状态，不能把一个终端的事件写入另一个终端。
- 应用关闭时终止全部会话；Windows ConPTY 进程放入 kill-on-close Job，避免遗留子进程。

## 代码锚点

`internal/terminal/manager.go`、`internal/terminal/output_batcher.go`、`internal/terminal/host_windows.go`、`app.go`、`src/app/features/terminal/repo-terminal-status.ts`、`src/app/features/terminal/terminal-event-bus.ts`。
