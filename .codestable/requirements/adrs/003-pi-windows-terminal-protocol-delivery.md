---
id: 003
title: Pi Windows 终端的协议交付与观测
status: accepted
date: 2026-08-04
scope: workspace
---

# Pi Windows 终端的协议交付与观测

## 背景

Pi 会在启动输出中开启 bracketed paste 并请求增强键盘协议。会话输出或退出若早于 React 绑定 xterm，控制序列会丢失；无限缓存又会让未绑定会话耗尽内存。Windows 浏览器还会使少量 Pi 输入失去稳定字节语义。目标机的直接 ConPTY→Node 字节探针确认：应用完整写入 `ESC[200~...ESC[201~` 后，Node stdin 前会剥掉这对 bracketed-paste 边界，使 Pi 把多行中的每个 `\r` 当成提交；修饰键 CSI 同样未到达，原始 LF 则保持为 `0a`。问题过去只能依赖真实 ConPTY 的时序和人工观察复现。

## 决定

- Go `Manager` 拥有后端会话，从登记到移除；它在发送退出事件前关闭输出批次，保证尾部原始输出先交付。
- `TerminalWorkspace` 独占 Wails 终端事件并按 `sessionId` 暂存绑定竞态中的完整输出与退出码。单会话缓存上限 1 MiB；溢出显式失败且不回放部分流，最后一个表面释放后停止为该会话缓存。
- Windows Pi 输入只由集中规则表处理：`Shift+Enter`/`Ctrl+J` 为 LF、`Ctrl+Backspace` 为 `Ctrl+W`。普通终端粘贴走应用剪贴板路径；只有观察到 Pi 的 OSC 0 标题（`π` 或 `π - <非空名称>`）、已确认 bracketed paste 和已请求或已协商增强键盘时，`Ctrl+V`、`Alt+V` 和右键的文本粘贴才绕过 xterm 的 bracketed-paste 编码，将所有行结束符规范为原始 LF 并作为一次输入队列写入。Pi 将 LF 识别为新行而非提交；图片仍走既有临时路径。Pi 随后的普通输出可暂时处于“等待 xterm 处理”，但已确认的模式仍有效，不得在此窗口退回旧粘贴路径；Pi 的 cmd/npm 子进程也会在同一 PTY 短暂改写 OSC 0 标题，不能据此撤销已确认的 Pi 身份；只有关闭 bracketed paste 或增强键盘、出现不完整 Pi 标题或终止会话后才恢复普通路径。完整修饰键不匹配或非 Windows 时保持 xterm 透传。
- 协议观察器只消费输出副本。xterm 仍接收完全相同的后端字节；观察器以 `onWriteParsed` 的公开 modes 确认受控粘贴，并以 `onData` 的协商响应确认增强键盘。跨输出块保留的尾部只能用于补全未完成的控制序列，不能将已完整处理的 Pi 键盘请求重新降级为“等待响应”。Windows ConPTY 对 Pi 0.84.1 会丢弃鼠标模式开启字节、却保留备用屏幕、受控粘贴和增强键盘字节；只有这四项形成 Pi 全屏指纹且未观测到鼠标模式时，`RepoTerminalSurface` 才额外向本地 xterm 写入 Pi 原本应输出的鼠标模式。该补偿绝不改写后端输出或伪造滚轮事件，Pi 离开备用屏幕或终端进程退出时必须关闭本地模式。
- 生命周期与协议正确性由脚本化 host、假 Wails 运行时和纯函数测试覆盖。真实 Windows ConPTY 测试仅在 `integration` 标签下作为烟测。

## 备选与后果

直接在正常输出通道中解析、筛除或重写控制序列会破坏 xterm 的协议语义，因此不采用。ConPTY 丢失 Pi 鼠标模式时，浏览器层伪造滚轮输入会和 xterm 原生编码竞争，且无条件为备用屏幕程序开启鼠标会污染其他 TUI；因此只对完整 Pi 指纹向本地 xterm 补回原始鼠标模式，并在退出时明确关闭。对于受控粘贴边界，重复或拆分应用输入写入会掩盖 ConPTY 的真实失败且仍不能使 Pi 识别粘贴，所以不采用；目标机探针已经否定“伪造 Pi `Alt+V`”的方案，因为该修饰键 CSI 也会被 ConPTY 吃掉。原始 LF 已被直接证明能到达 Node stdin，且是 Pi 的标准新行输入，因此只对完整 Pi 指纹将文本粘贴统一为 LF。代价是 Pi 无法把它识别为原子 bracketed paste，大文本不会启用其粘贴标记优化；该路径优先保证真实文本与换行不被逐行提交。无限缓存会把未绑定会话变成内存泄漏；静默截断会伪造成功，也不采用。全局改写快捷键会扩大非 Pi 的兼容矩阵，因此只保留精确的 Windows 规则表。

缓存溢出会要求用户重新打开终端，这是显式可恢复失败，不是回退。诊断状态只说明当前已观测到的 Pi/xterm 链路，Pi 升级后的新协议仍需要由新证据决定是否支持。

## 代码锚点

`internal/terminal/manager.go`、`internal/terminal/manager_lifecycle_test.go`、`src/app/features/terminal/terminal-workspace.tsx`、`src/app/components/repo-terminal-shortcuts.ts`、`src/app/components/terminal-protocol-observer.ts`、`src/app/components/repo-terminal-surface.tsx`。
