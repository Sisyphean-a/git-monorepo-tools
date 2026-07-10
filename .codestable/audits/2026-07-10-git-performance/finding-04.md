---
doc_type: audit-finding
audit: 2026-07-10-git-performance
finding_id: "performance-04"
nature: performance
severity: P2
confidence: high
suggested_action: cs-refactor
status: open
---

# Finding 04：批量同步前后各做一次完整扫描且实际同步串行

## 速答

批量拉取或推送会先扫描全部仓库，逐仓串行执行 Git 操作，再扫描全部仓库一次；配置中的扫描并发不用于中间的 pull/push 阶段。

## 关键证据

- `snapshot/operations.go:25` 至 `snapshot/operations.go:38` — `RunBatch` 先调用 `BuildAppSnapshot`，完成批量操作后再调用一次 `buildSnapshot`。
- `snapshot/operations.go:152` 至 `snapshot/operations.go:168` — `runBatch` 用普通 `for` 循环执行每个仓库，不会并行处理可独立的仓库。
- `snapshot/snapshot_workers.go:16` 至 `snapshot/snapshot_workers.go:58` — 扫描本身支持受控并发，但这一能力没有用于批量同步阶段。

## 影响

仓库数量增加时，批量同步的固定成本是两轮完整详情扫描，再叠加所有网络操作的串行耗时。用户会感到 Pull All/Push All 比实际需要更慢。

## 修复方向

批量同步前使用轻量状态判断；仅回读发生变化的仓库，并以受控并发执行彼此独立的网络操作。

## 建议动作

`cs-refactor`，因为需要复用现有并发模型并调整批量流程。
