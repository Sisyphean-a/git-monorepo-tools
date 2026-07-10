---
doc_type: audit-finding
audit: 2026-07-10-git-performance
finding_id: "performance-03"
nature: performance
severity: P1
confidence: high
suggested_action: cs-refactor
status: open
---

# Finding 03：全局远端刷新和自动扫描阻塞交互式暂存

## 速答

侧栏刷新和默认自动扫描都会做全工作区远端刷新；这些任务和单文件暂存使用同一个先进先出队列。只要某个仓库的远端抓取慢，用户的暂存就只能排队等待。

## 关键证据

- `src/app/App.tsx:82` — 侧栏刷新调用 `refreshSnapshot`；`src/app/use-snapshot-refresh.ts:74` 至 `src/app/use-snapshot-refresh.ts:76` 固定传入 `refreshRemotes: true`。
- `src/app/use-snapshot-refresh.ts:48` 至 `src/app/use-snapshot-refresh.ts:65` — 自动扫描定时执行同样的远端刷新；默认间隔为 60 秒。
- `src/app/App.tsx:204` 至 `src/app/App.tsx:209` — 暂存也通过同一个 `runQueuedTask` 进入协调器。
- `src/app/snapshot-coordinator.ts:94` 至 `src/app/snapshot-coordinator.ts:105` — 队列逐项 `await`，没有交互任务优先级或对已运行全局刷新的取消。
- `snapshot/git.go:77` 至 `snapshot/git.go:99` — 远端刷新对每个仓库先读状态、执行 `git fetch --prune --quiet`，成功后再读状态；失败时最多尝试三次，第三次前额外等待 5 秒。

## 影响

刷新按钮慢是预期结果：它会等待所有仓库完成本地详情构建和远端网络请求。更严重的是，自动扫描正在跑时，单文件暂存会表现为“点击后很久才开始”，即使该文件的 `git add` 本身很快。

## 修复方向

把远端同步和本地交互更新拆成不同优先级；交互暂存、单仓本地刷新应能跳过或压过过期的全局远端刷新。

## 建议动作

`cs-refactor`，因为这是任务编排和优先级设计问题。
