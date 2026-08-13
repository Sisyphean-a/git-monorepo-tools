---
处理方式: 调查
状态: 已关闭
认领者: ""
硬依赖: []
---

# Pi 快捷键归一策略

## 问题

Windows 上哪些 Pi 输入必须由应用归一成稳定字节，哪些必须由 xterm 原样编码透传，以及这一小组规则应如何集中定义、说明和测试？

## 答案

Windows 的 Pi 专属规则只在 `repo-terminal-shortcuts.ts` 的 `windowsTerminalShortcutRules` 定义：`Shift+Enter` 与 `Ctrl+J` 都写入原始 LF，`Ctrl+Backspace` 写入 `Ctrl+W`；`Ctrl+V` 与 `Alt+V` 走受控剪贴板路径；仅在存在选区时把 `Ctrl+C` 解释为复制。图片剪贴板优先传入临时 PNG 路径。文本默认由 xterm 的 `paste` 编码；但确认 Pi 标题、受控粘贴与增强键盘后，文本改为行结束符统一的原始 LF，避免 ConPTY 剥离受控粘贴边界，所有路径都进入同一按会话串行写入队列。

规则要求完整匹配修饰键，且仅平台标识以 `win` 开头时生效。任何未列出的按键、额外修饰键以及非 Windows 平台都交给 xterm，包括 `Ctrl+←/→`；应用不猜测或重编码它们。这保留了 xterm 的键盘协议协商空间，同时只修补 Pi 在 Windows 上需要的稳定字节。

## 依据

- 当前态：`.codestable/architecture/shared/terminal-runtime.md`。
- 决定：`.codestable/requirements/adrs/003-pi-windows-terminal-protocol-delivery.md`。
- 代码与回归：`src/app/components/repo-terminal-shortcuts.ts`、`src/app/components/repo-terminal-shortcuts.test.ts`。
