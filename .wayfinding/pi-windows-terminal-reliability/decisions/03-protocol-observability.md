---
处理方式: 原型
状态: 已关闭
认领者: ""
硬依赖: ["01-session-stream-ownership.md"]
---

# 协议状态观测

## 问题

怎样以最小界面和代码复杂度，展示 Pi 启动协议是否已完整交付并使 xterm 进入受控粘贴/键盘协商状态，同时不把协议解析逻辑耦合进正常终端数据通道？

## 答案

`TerminalProtocolObserver` 是不改变输出运输的旁路观察器。`RepoTerminalSurface` 先把每个原始输出块交给观察器，再原样排入 `TerminalOutputWriter`；观察器不能改写、筛除、延迟或路由该数据。它识别 bracketed-paste 的开关、增强键盘请求和 Pi 的 OSC 0 标题，并在 xterm `onWriteParsed` 后读取公开的 `terminal.modes.bracketedPasteMode`，因此“Pi 请求”与“xterm 已处理”不会混为一谈。它只把 xterm `onData` 中的键盘协商响应标为“已协商”，普通按键仍沿原输入链路写入后端。

除诊断显示外，已确认的默认 Pi 标题、受控粘贴和增强键盘组合可作为 Windows 剪贴板运输的资格：应用发送 Pi 的原生 `Alt+V` 键序列，而非会被 ConPTY 剥离边界的 bracketed-paste 文本。观察器本身不注入输入、不改变输出，且标题或协议不完整时必须回到默认终端路径。诊断弹窗同时展示启动输出已交付/待 xterm 处理、受控粘贴的请求和确认状态、以及键盘请求或响应状态，并保留原有浏览器事件、xterm 编码和后端写入记录。它能定位协商链路，不能也不尝试对未来 Pi 版本猜测兼容规则。

## 依据

- 当前态：`.codestable/architecture/shared/terminal-runtime.md`。
- 决定：`.codestable/requirements/adrs/003-pi-windows-terminal-protocol-delivery.md`。
- 代码与回归：`src/app/components/terminal-protocol-observer.ts`、`src/app/components/terminal-protocol-observer.test.ts`、`src/app/components/repo-terminal-surface.tsx`、`src/app/components/terminal-input-inspector-modal.tsx`。
