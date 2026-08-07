# 终端运行时

- scope: workspace

## 契约

- 默认终端按仓库路径复用会话：`EnsureTerminalSession` 返回现有会话或创建新会话。用户新增的终端标签调用 `CreateTerminalSession`，即使同一仓库已有终端也必须创建独立会话；独立标签只在创建它的仓库处展示，切换仓库时不得复用或展示其他仓库的会话。工作区主标签的选择按仓库独立保留，首次打开仓库默认展示“变更”，切回仓库时恢复该仓库此前选择。关闭独立终端标签调用 `CloseTerminalSession` 时，必须先让会话不再可复用，再终止对应进程。`RestartTerminalSession` 只替换指定会话。
- 终端输入按会话串行写入；会话结束、未知会话和启动失败必须显式报错。
- Windows 粘贴先用原生剪贴板格式检查图片；仅检测到图片时才启动隐藏的 PowerShell，将它落为 `%TEMP%/pi-clipboard-*.png` 并按输入队列写入终端。没有图片时不启动子进程，直接保留 xterm 的文本粘贴转换。`repo-terminal-shortcuts.ts` 的 `windowsTerminalShortcutRules` 是 Pi Windows 输入归一的唯一配置位置：只有完整匹配的 `Shift+Enter`、`Ctrl+J`、`Ctrl+Backspace`、`Ctrl+V`、`Alt+V` 和有选区时的 `Ctrl+C` 被应用接管；其余按键及额外修饰键（包括 `Ctrl+←/→`）均保持 xterm 透传。`Shift+Enter` 与 `Ctrl+J` 都发送原始 LF，作为 Pi 跨终端稳定识别的新行输入；`Ctrl+Backspace` 发送 `Ctrl+W`，匹配 PowerShell PSReadLine 的按词删除绑定。
- 后端把终端输出合并为批次再通过 `repo-terminal-output` 事件发送；`terminalSession` 在发送 `repo-terminal-exit` 前关闭批次，所以尾部输出一定先到达。前端 `terminal-workspace` module 通过最小 `TerminalRuntime` interface 拥有会话 lifecycle、按 `sessionId` 的事件分发和按仓库的状态聚合，不能把一个终端的事件写入另一个终端。会话创建和 xterm 绑定之间到达的输出和退出码按会话缓存，绑定时严格先回放输出再交付退出；每会话最多缓存 1 MiB，溢出必须显式失败且不得回放部分流。最后一个表面释放后清理未交付数据并停止重新缓存。各终端即使暂时不可见，也必须持续写入自身 xterm，项目切换不得由前端中转层裁剪输出或清空已有历史；历史淘汰仅遵循 xterm 自身的正常滚动缓冲策略。`RepoTerminalSurface` 只负责 xterm 显示与输入转发，不直接订阅运行时事件或调用会话绑定。
- 应用关闭时终止全部会话；Windows ConPTY 进程放入 kill-on-close Job，避免遗留子进程。
- `TerminalProtocolObserver` 只观察交给 xterm 的输出副本，绝不筛除、改写或路由该输出；它在 xterm `onWriteParsed` 后读取公开的受控粘贴 mode，并在 `onData` 观察键盘协商响应。终端诊断弹窗因此能区分“Pi 已请求”“输出待 xterm 处理”“xterm 已确认”和“已收到协商响应”。
- Windows ConPTY 会在 Pi 0.84.1 全屏启动时丢弃 DEC 鼠标开启序列，却保留备用屏幕、受控粘贴和增强键盘序列。`RepoTerminalSurface` 只有在观察到“已进入备用屏幕、已请求受控粘贴、增强键盘已请求或协商、且未收到鼠标序列”这一完整 Pi 指纹时，才把同一组鼠标模式写入本地 xterm；原始后端输出不改写，也不伪造浏览器滚轮。Pi 退出备用屏幕或终端进程退出时必须关闭这组本地模式，使 xterm 原生把滚轮编码为 SGR 鼠标输入且不影响其他终端程序。
- 不依赖真实时钟的后端脚本化 host 和前端假 Wails 测试负责事件先后、缓存上限和回放；快捷键与协议观察器使用纯函数测试。真实 ConPTY/PowerShell 测试仅是带 `windows && integration` 标签的 Windows 烟测。

## 代码锚点

`internal/terminal/manager.go`、`internal/terminal/manager_lifecycle_test.go`、`internal/terminal/output_batcher.go`、`internal/terminal/host_windows.go`、`app.go`、`src/app/features/terminal/terminal-workspace.tsx`、`src/app/components/repo-terminal-surface.tsx`、`src/app/components/repo-terminal-shortcuts.ts`、`src/app/components/terminal-protocol-observer.ts`、`src/app/components/terminal-protocol-observer.test.ts`。
