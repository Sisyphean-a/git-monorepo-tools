---
doc_type: feature-ff-note
feature: untracked-file-granularity
date: 2026-07-13
requirement:
tags: [git, status, changes]
---

## 做了什么

变更列表改为逐文件展示未跟踪内容，不再把整个未跟踪目录算作一个变更项；仓库变更数量与 VS Code 的文件粒度保持一致。

## 改了哪些

- `snapshot/git.go:readStatus` — 要求 Git 返回全部未跟踪文件，并删除目录聚合逻辑。
- `snapshot/git_test.go:TestBuildRepoSnapshotListsEveryChangedFile` — 覆盖 1 个已修改文件和同目录下 4 个未跟踪文件应显示为 5 项。
- `.codestable/requirements/` — 更新状态命令口径，并以 ADR 002 记录新的性能与完整性取舍。

## 怎么验证的

运行目标回归测试和 `go test ./...`；同时核对原截图涉及的路径由 Git 返回 5 条文件级状态。
