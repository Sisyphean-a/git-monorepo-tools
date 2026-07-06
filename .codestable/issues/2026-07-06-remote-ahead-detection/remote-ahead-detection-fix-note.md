---
doc_type: issue-fix
issue: 2026-07-06-remote-ahead-detection
path: fast-track
fix_date: 2026-07-06
tags: [git, remote, snapshot, auto-scan]
---

# 远端新提交无法自动感知 修复记录

## 1. 问题描述

应用启动或自动扫描时，只读取本地 `git status -b` 的结果，不会主动同步远端跟踪分支。这样远端已经多了提交时，界面里的 `behind` 仍然是旧值，只有别的工具先触发过 `fetch`，这里下一次刷新才会显示可 pull。

## 2. 根因

仓库快照构建时直接拿 `git status --porcelain=v1 -b` 解析 `ahead/behind`，但这个值依赖本地远端跟踪分支是否新鲜；代码里没有在扫描前执行 `git fetch`。

## 3. 修复方案

把“读取仓库状态”拆成两步：先读一次当前分支状态，确认存在 upstream 后执行 `git fetch --prune --quiet <remote>`，再重新读取 `git status -b` 计算 `ahead/behind`。同时把 `scripts/sync-real-data.mjs` 的镜像实现同步对齐。

## 4. 改动文件清单

- `snapshot/git.go`
- `snapshot/service.go`
- `snapshot/service_test.go`
- `scripts/sync-real-data.mjs`

## 5. 验证结果

- `go test ./snapshot/...` 通过。
- `go test ./...` 通过。
- `node --check scripts/sync-real-data.mjs` 通过。
- 新增回归测试覆盖“本地未手动 fetch，但远端多了 1 个提交，构建快照后应识别 `behind=1`”场景。

## 6. 遗留事项

无。
