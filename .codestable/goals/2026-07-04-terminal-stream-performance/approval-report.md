---
doc_type: approval-report
unit: .codestable/goals/2026-07-04-terminal-stream-performance
status: pending
reason: review-authorization
created_at: 2026-07-04
---

# Approval Report

## Decision Needed

是否授权 CodeStable 对本 goal 启动 Task agent，执行：

- 独立 implementation review
- 独立功能验收

## Why Now

按 `.codestable/reference/execution-conventions.md`，实现完成后必须经过独立 review；按 `cs-goal`，标记 `complete` 前必须有 Task agent 功能验收。当前代码和本地验证已经完成，而这个授权 gate 已连续阻塞 3 次 iteration；goal 现已按约定转为 `blocked`，等待 owner 决定。

## Context

本轮优化只覆盖仓库终端 Tab，owner 已明确：

- 交互优先
- 不扩展到其他输出 UI
- 完成证据用“真实场景 + 可复现压测”双证据

当前已完成的实现：

- 后端新增 `terminalOutputBatcher`，按 `16ms` 和 `64KB` 策略合并 PTY 高频输出，减少 Wails 事件风暴。
- 前端新增 `TerminalOutputWriter`，把终端输出改成逐帧分批写入 xterm，而不是逐事件立刻 `write()`。
- 前端新增 `TerminalEventBus`，把 Wails 运行时事件连接集中到单一总线，避免每个终端 surface 各自重复挂监听。
- 隐藏态终端会暂停 xterm 刷写，并把积压输出压到有界尾部；恢复可见时继续消费，并明确提示旧输出已跳过。
- 终端 `scrollback` 从 `8000` 收紧到 `2000`，优先把资源让给交互流畅性。
- 压测与验证已补齐。

最近一轮额外优化：

- 后端 batcher 的 pending 容器从字符串数组换成 `bytes.Buffer`，减少 join 分配。
- 前端 writer 去掉 `shift()` 热点，改成游标式消费与按需压缩。
- 前端补齐隐藏态 backlog 截断测试，确认大流量切后台后不会无限积压。

当前证据：

- `go test ./...`：passed
- `go test -run TestTerminalManagerHighVolumeOutputBatchesEvents -count=1`：passed
- `go test -bench BenchmarkTerminalOutputBatcherBurst -benchmem -run ^$`：passed
  - `42669 ns/op`
  - `196816 B/op`
  - `16 allocs/op`
- `npm run test:snapshot-coordinator`：passed（21/21）
- `npm run web:build`：passed
- `npm run build`：passed（Wails build）
- 真实 PTY 压测：`5000` 行 PowerShell 输出，事件数断言 `< 512`
- 前端 writer 压测：`5000` 次 `enqueue`，最终写入次数断言 `< 20`

## Options

1. Task agent review + acceptance（推荐）
2. 暂不授权，goal 保持 `active`

## Recommendation

选择选项 1。当前实现收益和本地证据已经齐备，最合理的下一步是让独立 Task agent 只读审查 diff，并按 owner 的 done signal 做终端功能验收。

## Risks And Tradeoffs

- 若不做独立 review，可能遗漏高频输出下的边角行为回归，例如输出顺序、退出尾消息时序、隐藏 Tab 恢复后的刷写节奏。
- 若不做功能验收，当前只能证明“本地压测和构建通过”，不能按 goal 规则证明“实际终端体验满足 owner 预期”。
- 若继续不回答授权问题，goal 会保持 `blocked`，不会被伪装成已完成。

## Non-Automatic Actions

- 这不会自动 commit、merge、push、deploy。
- 即使你授权 Task agent，review finding 也不会被自动接受；我仍会核对并决定是否需要继续修正。

## After You Answer

- 若授权：我启动独立 Task agent review 与功能验收，完成后立即关闭不再使用的子代理，再根据结果决定是否关闭 goal。
- 若不授权：goal 保持 `blocked`，等待后续决策。
