---
doc_type: feature-ff-note
feature: history-tab
date: 2026-07-06
requirement:
tags: [git, history, ui]
---

## 做了什么
把仓库历史 tab 从固定 5 条的简列表，升级成可浏览的提交历史视图。
现在可以看更多提交、点开单条详情、复制 hash，并把 `git show` 直接发到内置终端继续看。

## 改了哪些
- `snapshot/git.go`、`snapshot/service.go`、`snapshot/operations.go`、`snapshot/types.go`、`app.go` — 历史读取改成分页摘要 + 单条详情接口，首屏默认给 50 条并返回是否还有更多。
- `src/app/components/repo-history-tab.tsx`、`src/app/components/workspace.tsx`、`src/app/components/workspace-parts.tsx` — 新增高密度历史 tab，支持加载更多、详情面板、复制 hash、在终端查看。
- `src/app/api.ts`、`src/app/types.ts`、`src/vite-env.d.ts`、`frontend/wailsjs/go/main/App.*`、`frontend/wailsjs/go/models.ts` — 补前后端绑定与类型。
- `src/app/api.test.ts`、`src/app/repo-snapshot-merge.test.ts`、`.tmp/snapshot-tests/*`、`snapshot/*_test.go` 依赖路径 — 补历史接口和新字段相关测试样例。

## 怎么验证的
执行了 `npm run test:snapshot-coordinator`。
执行了 `go test ./snapshot/...` 和 `npm run web:build`。

## 顺手发现（可选，不阻塞）
- 历史 tab 目前还没有按分支/作者筛选，也没有图形化完整提交树；当前版本刻意只做浏览，不继续扩成完整 Git 操作面板。
