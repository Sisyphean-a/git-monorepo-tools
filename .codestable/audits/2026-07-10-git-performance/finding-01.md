---
doc_type: audit-finding
audit: 2026-07-10-git-performance
finding_id: "performance-01"
nature: performance
severity: P1
confidence: high
suggested_action: cs-refactor
status: open
---

# Finding 01：暂存一个文件后重建完整仓库详情

## 速答

单文件暂存先执行 `git add -- <file>`，成功后立即同步构建整个仓库详情；因此用户等待的不只是暂存写索引，还包括差异统计、历史统计和本地文件扫描。

## 关键证据

- `snapshot/operations.go:9` — `MutateRepo` 在任何变更动作成功后，固定在第 18 行调用 `buildRepoUpdate`。
- `snapshot/operations.go:109` — 单文件暂存实际只是一条 `git add -- <file>`，但不能直接返回，必须等待后续完整更新。
- `snapshot/git.go:65` — 更新先读 `git status --porcelain=v1 -b`；`snapshot/git.go:122` 又顺序执行暂存和未暂存两条 `git diff --numstat`。
- `snapshot/git.go:134` — 每次更新都读最近 51 个提交及其 `--numstat`，无论用户是否打开历史页。
- 本机拆分实测：上述四条 Git 读取合计均值 430.4 ms；其中历史读取 179.4 ms，占约 42%。当前仓库只有 1 个未跟踪项，不能代表大仓库上限。

## 影响

单文件暂存的等待时间随仓库改动数量、提交历史中最近 51 条的变更量和磁盘速度增长。多次连续点击会在前端队列中顺序等待，造成明显卡顿。

## 修复方向

把“变更后的状态回写”拆为轻量交互快照和按需加载的文件统计、提交历史；暂存后优先返回必要的状态和受影响文件。

## 建议动作

`cs-refactor`，因为需要调整既有快照的数据粒度和加载时机。
