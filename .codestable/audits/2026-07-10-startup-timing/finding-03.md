---
doc_type: audit-finding
audit: 2026-07-10-startup-timing
finding_id: bug-03
nature: bug
severity: P1
confidence: high
suggested_action: cs-issue
status: open
---

# Finding 03：已暴露的 Git 超时配置没有进入执行链

## 速答

界面允许用户设置 30/60/120 秒超时，但该值没有传给后端，Git 和自定义命令都用无截止时间的 `exec.Command` 执行。

## 关键证据

- `src/app/settings.ts:23-24,103-104`：默认值和可选项都包含 `timeoutSeconds`。
- `src/app/api.ts:3-12`：发送给后端的 `SnapshotRequest` 没有 `timeoutSeconds` 字段。
- `snapshot/types.go:3-12`：Go 侧 `Request` 同样没有该字段。
- `snapshot/git.go:38-49`：Git 使用 `exec.Command`，没有 `context` 或超时控制。
- `snapshot/command_runner.go:139-153`：自定义命令也用普通 `exec.Command` 创建并启动，没有截止时间。
- `src/app/snapshot-coordinator.ts:66-74`：队列会等待当前任务完成；一个永久卡住的 Git 进程会阻塞之后的手动刷新和仓库操作。

## 影响

网络不可达、凭据交互卡住或 Git 进程异常时，启动 worker 可以长期不返回；日常刷新队列则会把后续所有操作堵在前面。用户已设置的超时不会生效，因而“偶发卡住”会被误判为时序问题。

## 修复方向

把 `timeoutSeconds` 从前端请求传到后端执行层，用 `context.WithTimeout` 和 `exec.CommandContext` 约束 Git 及自定义命令；超时要作为真实错误返回给当前任务和界面。

## 建议动作

`cs-issue`，因为这是已有用户配置失效且会阻塞任务调度的明确缺陷。
