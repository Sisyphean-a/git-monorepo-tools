---
doc_type: feature-ff-note
feature: remove-diff-pane
date: 2026-07-01
requirement:
tags: [ui, fastforward, workspace]
---

## 做了什么
移除了主工作区中间的 diff 预览窗口，主区域改为“变更列表 + AI 提交面板”双列布局。
同时清掉已经失去入口的 diff 预览前端接口、类型和本地 API 路由，避免继续维护死代码。

## 改了哪些
- `src/app/components/workspace.tsx` — 删除 diff 预览列、相关状态和加载逻辑。
- `src/app/components/diff-list.tsx` — 去掉文件选中预览逻辑，并改为占满主内容区。
- `src/app/api.ts`、`src/app/types.ts`、`scripts/vite-git-api.mjs`、`scripts/sync-real-data.mjs` — 删除失效的 diff 数据链路。

## 怎么验证的
运行 `npm run build` 通过，构建前会自动执行 `npm run sync:data`。
复查当前 diff，确认主界面不再渲染 `DiffPreview`，也不再请求 `/api/repos/:id/diff`。

## 顺手发现
- `src/app/data.ts` 是运行 `sync:data` 后的环境快照文件，每次验证都会产生较大生成差异；本次未改变这套生成策略。
