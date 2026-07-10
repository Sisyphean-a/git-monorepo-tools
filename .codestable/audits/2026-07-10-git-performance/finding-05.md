---
doc_type: audit-finding
audit: 2026-07-10-git-performance
finding_id: "performance-05"
nature: performance
severity: P2
confidence: high
suggested_action: cs-refactor
status: open
---

# Finding 05：日志查看读取完整提交统计文本

## 速答

打开仓库日志时，应用一次读取最近 10 个提交的完整 `--stat` 输出；大提交或二进制变更会产生大量文本并跨进程传到前端。

## 关键证据

- `snapshot/operations.go:41` 至 `snapshot/operations.go:53` — `GetRepoLog` 直接执行 `git log --decorate --stat -10`，并把全部输出放入响应。
- `src/app/App.tsx:235` 至 `src/app/App.tsx:240` — 前端点击日志后直接请求该完整内容，没有先拿摘要或按提交展开。

## 影响

日志面板通常不是高频操作，因此优先级低于暂存和刷新；但在包含大量改动的大提交上，点击日志可能造成明显等待和界面传输压力。

## 修复方向

先返回提交摘要；文件统计和提交详情按用户展开时再读取，并限制单次返回的体积。

## 建议动作

`cs-refactor`，因为需要把现有一次性日志载入改成渐进读取。
