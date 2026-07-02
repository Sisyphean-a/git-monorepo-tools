---
doc_type: issue-fix
issue: 2026-07-02-slow-git-mutate-operations
path: fast-track
fix_date: 2026-07-02
tags: [performance, git, snapshot]
---

# Git 暂存与提交操作慢 修复记录

## 1. 问题描述

触发 `stage` / `unstage` / `commit` 一类单仓库 Git 操作时，界面响应明显偏慢。慢点主要出现在真正执行 Git 命令前后的仓库扫描，而不是 `git add` / `git commit` 本身。

## 2. 根因

- `snapshot/operations.go` 的 `resolveRepo()` 原先为了找到目标仓库，会对扫描到的每个仓库调用 `buildRepoSnapshot()`。
- `MutateRepo()` 在执行完 Git 操作后，又会调用一次 `BuildAppSnapshot()` 做全量刷新。
- 对 `stage` / `unstage` / `commit` 这类动作，前端其实已经知道目标仓库路径，但后端仍会先做一次目标仓库预扫，属于额外开销。

## 3. 修复方案

- 后端仓库定位改为先用仓库路径推导 `repoId`，只有命中目标仓库时才构建快照，不再为所有仓库做无效 `buildRepoSnapshot()`。
- 前端在单仓库操作时一并传 `repoPath`。
- 后端对 `stage-all`、`unstage-all`、`stage-file`、`unstage-file`、`commit` 优先使用校验后的 `repoPath`，命中时跳过操作前的目标仓库预扫；hint 不可用时回退到原有按 `repoId` 定位逻辑。
- `scripts/sync-real-data.mjs` 中的镜像实现同步对齐，避免两套逻辑再次漂移。

## 4. 改动文件清单

- `snapshot/repo_resolution.go`
- `snapshot/operations.go`
- `snapshot/types.go`
- `snapshot/operations_test.go`
- `snapshot/benchmark_test.go`
- `src/app/api.ts`
- `src/app/components/workspace.tsx`
- `scripts/sync-real-data.mjs`

## 5. 验证结果

- `go test ./snapshot/...` 通过。
- `npm run test:snapshot-coordinator` 通过。
- `npm run web:build` 通过。
- `node --check scripts/sync-real-data.mjs` 通过。
- 定向 benchmark：
  - `BenchmarkBuildAppSnapshot`: `1051983900 ns/op`
  - `BenchmarkResolveRepo`: `292252000 ns/op`
  - `BenchmarkResolveRepoForCommitWithPathHint`: `3600 ns/op`

## 6. 遗留事项

操作完成后仍保留一次 `BuildAppSnapshot()` 全量刷新，用于同步整个仓库列表与当前仓库详情；本次未改前后端快照返回协议。
