---
doc_type: feature-ff-note
feature: 2026-07-01-localize-ui-copy
date: 2026-07-01
requirement:
tags: [ui, copy, localization]
---

## 做了什么
把前端界面里适合中文化的普通英文文案统一改成中文，保留 Pull、Push、Git、AI 等专用词。
同时把会被脚本生成并展示到 UI 的候选提交文案一并改成中文，避免刷新后回退成英文。
并将开发与预览默认端口固定为 `5700`，作为当前版本一并收口提交。

## 改了哪些
- `src/app/components/*` — 统一替换可见 UI 文案，包括侧边栏、工作区、设置、批量操作结果、AI 提交面板等
- `src/app/App.tsx` — 顶栏设置按钮提示改中文
- `scripts/sync-real-data.mjs` — 同步中文化生成日志和提交候选文案
- `vite.config.ts` — `dev/preview` 默认端口改为 `5700`

## 怎么验证的
运行 `npm run build`，构建通过。
构建过程自动执行 `npm run sync:data`，确认生成数据模块后仍能正常打包。
