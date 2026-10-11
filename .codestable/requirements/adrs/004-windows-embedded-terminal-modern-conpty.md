---
id: 004
title: Windows 内嵌终端使用随包现代 ConPTY
status: accepted
date: 2026-10-11
scope: workspace
supersedes: 003（仅其 ConPTY 前提与本地补回鼠标模式的子决定）
---

# Windows 内嵌终端使用随包现代 ConPTY

## 背景

同一份内嵌终端代码在 Windows 10 22H2 上丢弃鼠标协议、在 Windows 11 上正常：`kernel32!CreatePseudoConsole` 在 Windows 10 会回退到 inbox 实现（`conhost.exe --headless`），它在输出侧丢弃 DEC 模式的 `1049h`、`1000h`、`1002h`、`1003h`、`1006h`，在输入侧吞掉 SGR 鼠标上报；Windows 11 的 inbox 实现已是 Windows Terminal 同源的现代版本。结果是 xterm 永远拿不到鼠标模式（滚轮被编码为方向键），而即便本地补回鼠标模式，回传的上报也到不了 Pi，内嵌终端里 Pi 全屏滚轮完全无效；外部终端不受影响。

ADR-003 的前提“ConPTY 保留备用屏幕、只丢鼠标模式”在 Windows 10 22H2 + Pi 1.1.0 上不再成立：备用屏幕同样被丢弃，因此以 `alternateScreenRequested === true` 为前置条件的前端补偿在该路径上永不触发。

## 决定

- 随包分发 Windows Terminal 同源的 `conpty.dll` 与 `OpenConsole.exe`（`internal/terminal/conptyassets/`，MIT，来自 node-pty `third_party/conpty` 的 `win10-x64` 构建），首次创建终端时解包到用户缓存目录，`LoadLibraryEx`（`LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR`）后使用 `ConptyCreatePseudoConsole`；resize、release、close 必须与创建来源同源，不能跨实现混用 HPCON。
- 只有解包、加载或取符号失败时就让终端显式启动失败，并保留失败原因；不降级到 inbox 实现，也不静默继续。
- 备用屏幕下向 xterm 补回鼠标模式的本地补偿、`TerminalProtocolStateMachine` 的 effects 机制及其测试全部删除：随包实现下它们已不可达，留着只会让读者以为滚轮仍依赖补偿。协议观察（诊断弹窗）与 LF 粘贴路径保留，它们与鼠标协议无关。
- 契约由 `windows && integration` 测试固定：Pi 启动写入的六个 DEC 模式必须到达终端侧，`ESC[<64;x;yM` 必须到达子进程 stdin；接收侧原始 LF 仍保持 `0a`。

## 备选与后果

- 由前端把滚轮翻译成 PageUp/PageDown：只修 Pi、与 Pi 键位绑定耦合，并且在已有现代 ConPTY 的机器上必须额外停用，因此不采用。
- 保留 inbox 静态回退：一旦随包二进制缺失或被安全软件拦下，回退会把已修复的缺陷重新带回来，而 GUI 里唯一迹象是一行日志，无法解释“有时滚不动”，因此不采用。
- 依赖系统的 `conpty.dll`：Windows 10（含已安装 Windows Terminal 的机器）的 `System32` 没有该文件，转发无法生效，因此必须随包。
- 代价：仓库新增约 2.5 MiB 第三方二进制，并随 go:embed 进入每个构建产物；缓存目录用内容哈希校验，损坏或写失败的资产会重新解包而不会被复用。
- 尚未重新验证：换用随包现代 ConPTY 后，输入的 `ESC[200~`/`ESC[201~` 边界与修饰键 CSI 是否仍被吃掉，以及 LF 粘贴路径是否可以退役，需要单独验证后再决定；Windows 11 上的真实应用运行也尚未实测。

## 代码锚点

`internal/terminal/conpty_windows.go`、`internal/terminal/conptyassets/`、`internal/terminal/host_windows.go`、`internal/terminal/conpty_mouse_windows_test.go`、`internal/terminal/conpty_input_windows_test.go`
