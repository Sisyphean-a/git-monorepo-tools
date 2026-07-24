---
id: 001
title: 分离交互操作与后台 Git 刷新
status: accepted
date: 2026-07-10
scope: workspace
---

# 分离交互操作与后台 Git 刷新

## 背景

把全量刷新、历史或远端读取放进用户刚发起的 Git 操作，会让交互等待随仓库规模和网络状况增长；较早的后台结果还可能回写覆盖较新的交互结果。

## 决定

- 交互操作通过前台队列串行执行，并回写目标仓库的 `RepoSnapshotUpdate`。
- 后台刷新独立排队；每项刷新记录交互代次，代次过期时不应用结果。
- 历史、提交详情和文件差异作为按需接口读取；批量操作按设置的并发数执行并只回写实际执行的仓库。

## 备选与后果

只缩短超时或把后台任务排到队尾都不能消除已运行任务的等待和旧结果覆盖。此决定增加了前端调度与加载状态的复杂度，但避免把慢远端和大历史变成所有交互的同步成本。

## 代码锚点

`src/app/application/snapshot-coordinator.ts`、`src/app/application/use-snapshot-refresh.ts`、`snapshot/service.go`、`snapshot/batch.go`、`snapshot/git_history.go`、`snapshot/file_diff.go`。
