---
doc_type: audit-finding
audit: 2026-07-11-sidebar-related-logic
finding_id: "performance-01"
nature: performance
severity: P1
confidence: high
suggested_action: cs-refactor
status: resolved
---

# Finding 01：终端每次输出都重渲染完整侧边栏

## 速答

任意终端输出事件都会发布新的全局状态快照，使整个 `Sidebar` 及所有仓库项重新渲染；高频命令输出时会持续占用 UI 主线程。

## 关键证据

- `src/app/repo-terminal-status.ts:84` — 每个 `repo-terminal-output` 事件都立即调用 `markTerminalOutput`，没有批处理或状态去重。
- `src/app/repo-terminal-status.ts:110` — 即使状态已经是 `active`，仍创建新 entry 并进入 `setEntry`。
- `src/app/repo-terminal-status.ts:141` — 每次 entry 更新都重建完整对象快照并通知全部 listener。
- `src/app/components/sidebar.tsx:192` — `Sidebar` 直接订阅整个终端状态对象。
- `src/app/components/sidebar.tsx:297` — 每次重渲染还会按每个分类重新过滤完整仓库数组并重建全部仓库项。

## 影响

打开输出密集的终端任务时，输出块数量直接转化为侧边栏全量渲染次数；仓库和分类越多，卡顿越明显，并可能反过来拖慢终端显示。

## 修复方向

将终端活动状态更新去重或按帧批处理，并把订阅粒度收敛到单仓库指示器，避免侧边栏父组件订阅完整状态表。

## 建议动作

`cs-refactor`，因为需要调整状态存储和组件订阅边界，目标是不改变终端状态语义。
