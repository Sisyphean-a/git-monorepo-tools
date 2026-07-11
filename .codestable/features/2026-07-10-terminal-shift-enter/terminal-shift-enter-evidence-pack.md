---
doc_type: feature-evidence-pack
feature: 2026-07-10-terminal-shift-enter
status: passed
generated: 2026-07-10
---

# Shift+Enter 审查证据包

## 本轮代码范围

- `src/app/components/repo-terminal-shortcuts.ts`
- `src/app/components/repo-terminal-shortcuts.test.ts`
- `src/app/components/repo-terminal-surface.tsx`
- `terminal_host_windows.go`
- `terminal_host_windows_test.go`
- `terminal_manager_windows_test.go`

当前检出中 Ctrl+V 修复、生成快照文件和 `frontend/wailsjs/go/models.ts` 的改动均早于本 feature 启动，不属于本轮范围。

## 实现事实

- Windows `Shift+Enter` 产生 `\x1b[1;8S` 并消费默认 Enter。
- 代理序列与普通输入共享现有会话 Promise 队列。
- 两种 PowerShell 在进程启动前具有 VT 输入标志；Windows PowerShell 使用其自身标准 PSReadLine 模块路径。
- 启动脚本显式加载 PSReadLine 并把代理键绑定到 `AddLine`。

## 验证结果

| 验证 | 结果 |
|---|---|
| `npx tsc -p tsconfig.snapshot-tests.json --noEmit` | passed |
| `npm run test:snapshot-coordinator` | passed, 45 tests |
| `go test ./...` | passed |
| `npm run wails:build` | passed |
| pwsh ConPTY 多行交互 | passed, pwsh 7.6.3 / PSReadLine 2.4.5 |
| Windows PowerShell 回退 ConPTY 多行交互 | passed, 5.1.26100.8655 / PSReadLine 2.0.0 |

## 残余风险

- 已启动的 Wails 桌面终端正常渲染；本宿主的合成按键被外层自动化输入框截获，无法直接注入 WebView2/xterm。真实 ConPTY 双 Shell 验证覆盖了同一后端和 PSReadLine 交互链路。
- REV-001 已补测 xterm 的 `keydown + keypress` 连续事件，确认只发送一次代理序列且不放行普通回车。
