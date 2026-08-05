---
处理方式: 调查
状态: 已关闭
认领者: ""
硬依赖: ["01-session-stream-ownership.md", "02-pi-shortcut-profile.md"]
---

# 时序与协议测试边界

## 问题

在不使用浏览器自动化的前提下，哪些测试层分别验证事件交付顺序、Pi 专属输入字节和 xterm 受控粘贴语义，才能让同类问题在合并前可重复发现？

## 答案

后端生命周期测试直接给 `terminalSession` 注入脚本化 host，用通道控制输出 EOF 和退出结果，断言尾部输出原样发送在退出事件之前，并断言会话随后从 `Manager` 移除；其中没有真实 shell、睡眠或机器速度假设。

前端工作区测试使用假 Wails 运行时，在绑定前发送输出和退出，断言按输出后退出的顺序回放；还验证无绑定缓存达到上限时明确失败而不部分回放。快捷键测试验证 Windows 的精确字节、完整修饰键和非 Windows 透传；协议观察器测试验证跨块控制序列、xterm 的受控粘贴确认、键盘响应和协议关闭。全部属于 `go test ./...` 与 `npm run test:snapshot-coordinator`，不依赖浏览器自动化。

真实 ConPTY/PowerShell 测试只作为 Windows 的可选烟测，以 `windows && integration` 构建标签隔离，执行命令为 `go test -tags=integration ./internal/terminal`；它不承担时序正确性的合并门禁。

## 依据

- 当前态：`.codestable/architecture/shared/terminal-runtime.md`。
- 决定：`.codestable/requirements/adrs/003-pi-windows-terminal-protocol-delivery.md`。
- 代码与回归：`internal/terminal/manager_lifecycle_test.go`、`src/app/features/terminal/terminal-workspace.test.ts`、`src/app/components/repo-terminal-shortcuts.test.ts`、`src/app/components/terminal-protocol-observer.test.ts`。
