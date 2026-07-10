---
doc_type: feature-ff-note
feature: progressive-repo-scan
date: 2026-07-08
requirement:
tags: [frontend, go, startup-scan]
---

## 做了什么
把启动阶段从“整页等扫描结束”改成了“先显示仓库列表，再逐个补齐仓库状态”。
每个仓库扫描中会显示转动的 loading 图标，扫完后再切回正常状态；主区在仓库未就绪时也会显示扫描中的占位。

## 改了哪些
- `snapshot.Service.BuildWorkspaceBootstrap` / `App.GetWorkspaceBootstrap` — 新增启动骨架接口，只返回仓库列表和 checking 状态
- `use-progressive-startup-scan` / `bootstrap-snapshot` — 前端启动时先装配骨架快照，再并发刷新每个仓库
- `Sidebar` / `RepoListStatus` / `Workspace` — 列表项显示扫描动效，底部文案改成“启动扫描中…”，主区增加扫描中占位

## 怎么验证的
跑过 `go test ./snapshot ./...`、`npm run test:snapshot-coordinator`、`npm run web:build`，全部通过。
手动检查了关键 diff，确认仓库列表会先渲染，占位状态会随着单仓库刷新逐步消失。
