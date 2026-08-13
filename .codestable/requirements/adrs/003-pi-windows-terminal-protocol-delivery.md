---
id: 003
title: Pi Windows 终端的协议交付与观测
status: accepted
date: 2026-08-04
scope: workspace
---

# Pi Windows 终端的协议交付与观测

## 背景

Pi 会在启动输出中开启 bracketed paste 并请求增强键盘协议。会话输出或退出若早于 React 绑定 xterm，控制序列会丢失；无限缓存又会让未绑定会话耗尽内存。Windows 浏览器还会使少量 Pi 输入失去稳定字节语义。实机字节探针还确认：某些 Windows ConPTY 会在应用完整写入 `ESC[200~...ESC[201~` 后、Node stdin 前剥掉这对 bracketed-paste 边界，使 Pi 把多行中的每个 `\r` 当成提交；同一链路也无法可靠保留修饰 Enter。问题过去只能依赖真实 ConPTY 的时序和人工观察复现。

## 决定

- Go `Manager` 拥有后端会话，从登记到移除；它在发送退出事件前关闭输出批次，保证尾部原始输出先交付。
- `TerminalWorkspace` 独占 Wails 终端事件并按 `sessionId` 暂存绑定竞态中的完整输出与退出码。单会话缓存上限 1 MiB；溢出显式失败且不回放部分流，最后一个表面释放后停止为该会话缓存。
- Windows Pi 输入只由集中规则表处理：`Shift+Enter`/`Ctrl+J` 为 LF、`Ctrl+Backspace` 为 `Ctrl+W`。普通终端粘贴走应用剪贴板路径；只有观察到 Pi 的 OSC 0 标题（`π` 或 `π - <非空名称>`）、已确认 bracketed paste 和已请求或协商增强键盘时，`Ctrl+V`、`Alt+V` 和右键粘贴才写入 Pi Windows 默认 `Alt+V` 的 modifyOtherKeys 序列 `ESC[27;3;118~`，让 Pi 在进程内读取文字或图片剪贴板，避开 ConPTY 的 bracketed-paste 输入剥离。Pi 随后的普通输出可暂时处于“等待 xterm 处理”，但已确认的模式仍有效，不得在此窗口退回旧粘贴路径；关闭 bracketed paste、改变标题或终止会话后恢复普通路径。完整修饰键不匹配或非 Windows 时保持 xterm 透传。
- 协议观察器只消费输出副本。xterm 仍接收完全相同的后端字节；观察器以 `onWriteParsed` 的公开 modes 确认受控粘贴，并以 `onData` 的协商响应确认增强键盘。Windows ConPTY 对 Pi 0.84.1 会丢弃鼠标模式开启字节、却保留备用屏幕、受控粘贴和增强键盘字节；只有这四项形成 Pi 全屏指纹且未观测到鼠标模式时，`RepoTerminalSurface` 才额外向本地 xterm 写入 Pi 原本应输出的鼠标模式。该补偿绝不改写后端输出或伪造滚轮事件，Pi 离开备用屏幕或终端进程退出时必须关闭本地模式。
- 生命周期与协议正确性由脚本化 host、假 Wails 运行时和纯函数测试覆盖。真实 Windows ConPTY 测试仅在 `integration` 标签下作为烟测。

## 备选与后果

直接在正常输出通道中解析、筛除或重写控制序列会破坏 xterm 的协议语义，因此不采用。ConPTY 丢失 Pi 鼠标模式时，浏览器层伪造滚轮输入会和 xterm 原生编码竞争，且无条件为备用屏幕程序开启鼠标会污染其他 TUI；因此只对完整 Pi 指纹向本地 xterm 补回原始鼠标模式，并在退出时明确关闭。对于受控粘贴边界，重复或拆分应用输入写入会掩盖 ConPTY 的真实失败且仍不能使 Pi 识别粘贴，所以不采用；无条件发送 Pi 的 `Alt+V` 又会污染其他终端程序，因此只能在标题和协议都确认的 Pi 会话中委托其原生剪贴板读取。无限缓存会把未绑定会话变成内存泄漏；静默截断会伪造成功，也不采用。全局改写快捷键会扩大非 Pi 的兼容矩阵，因此只保留精确的 Windows 规则表。

缓存溢出会要求用户重新打开终端，这是显式可恢复失败，不是回退。诊断状态只说明当前已观测到的 Pi/xterm 链路，Pi 升级后的新协议仍需要由新证据决定是否支持。

## 代码锚点

`internal/terminal/manager.go`、`internal/terminal/manager_lifecycle_test.go`、`src/app/features/terminal/terminal-workspace.tsx`、`src/app/components/repo-terminal-shortcuts.ts`、`src/app/components/terminal-protocol-observer.ts`、`src/app/components/repo-terminal-surface.tsx`。
