---
doc_type: audit-finding
audit: 2026-07-10-startup-timing
finding_id: bug-01
nature: bug
severity: P1
confidence: high
suggested_action: cs-refactor
status: open
---

# Finding 01：启动扫描绕过刷新队列，旧结果可覆盖新状态

## 速答

用户已能在首屏列表出现后触发刷新、设置保存或仓库操作，但启动扫描继续把基于初始骨架的整包快照写回；慢请求晚到时会把新数据退回旧数据或“扫描中”。

## 关键证据

- `src/app/App.tsx:61-67`：启动扫描和日常刷新同时创建，但只有后者使用 `createSnapshotCoordinator`。
- `src/app/use-progressive-startup-scan.ts:67-74`：启动流程先生成骨架快照，随后直接逐仓扫描，并在结束后另起一次全量远程刷新；这三段都不经过日常队列。
- `src/app/use-progressive-startup-scan.ts:87-97`：多个 worker 以初始 `snapshot` 为起点累积结果并持续调用 `handlers.applySnapshot(nextSnapshot)`，没有请求代次或“当前任务仍有效”的校验。
- `src/app/use-progressive-startup-scan.ts:101-106`：后台远程全量刷新也直接写回，并且不与手动刷新、批量操作或单仓变更排序。
- `src/app/snapshot-coordinator.ts:32-60`：队列只协调从 `useSnapshotRefresh` 进入的刷新和任务，无法约束上述启动任务。

## 影响

典型顺序是：启动骨架出现 -> 用户点击全局刷新或执行单仓操作 -> 新结果写入 -> 仍在飞行的启动 worker 或后台远程刷新返回 -> 旧的整包快照再次写入。结果可能是刚变更的仓库详情消失、状态回到 `checking`，或远端状态退回旧值；直到下一次完整自动扫描才恢复。由于默认启动并发为 5，这不是极端并发条件。

## 修复方向

让启动、手动刷新、定时扫描、批量操作和单仓回包共享一个快照协调器；为每次全量快照分配代次，只允许当前代次写回。单仓更新应合并到当前快照，启动 worker 的结果不能再替换整包状态。

## 建议动作

`cs-refactor`，因为要统一既有任务编排和状态写回规则，目标是消除时序不确定性而非增加功能。
