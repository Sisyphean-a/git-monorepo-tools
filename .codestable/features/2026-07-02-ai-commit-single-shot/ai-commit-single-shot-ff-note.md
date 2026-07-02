---
doc_type: feature-ff-note
feature: ai-commit-single-shot
date: 2026-07-02
requirement:
tags: [ai-commit, git, ui]
---

## 做了什么
修复了 AI 提交信息首轮生成后会被自动刷新覆盖成默认内容的问题。
把 AI 提交生成改成单条直出：点击生成后直接写入输入框，不再展示三条候选卡片。

## 改了哪些
- `snapshot/ai.go: GenerateCommitMessage / buildAIRequestContent` — 改成单条提交信息生成入口，保留现有 staged/all diff 取数边界。
- `snapshot/ai_client.go: requestAICompletion / extractCommitMessage` — 复用 RepoMirror 风格的 JSON object 请求与单条消息容错解析。
- `app.go: GenerateCommitMessage`、`src/app/api.ts: generateCommitMessage`、`src/vite-env.d.ts`、`frontend/wailsjs/go/main/App.*` — 前后端绑定切到单条消息返回。
- `src/app/components/workspace.tsx: useEffect / handleGenerateCommit`、`src/app/components/ai-commit-panel.tsx` — 修复刷新覆盖，移除候选卡片，改为直接填充输入框。
- `src/app/components/settings-modal.tsx`、`src/app/settings.ts` — 去掉三候选相关设置展示，更新默认生成说明。
- `snapshot/ai_test.go`、`src/app/api.test.ts` — 补解析与前端绑定测试。

## 怎么验证的
执行了 `go test ./...`。
执行了 `npm run test:snapshot-coordinator` 和 `npm run web:build`。

## 顺手发现（可选，不阻塞）
- `src/app/components/settings-modal.tsx` 文件仍然偏长（当前约 549 行），后续若继续叠加设置项，建议单独拆分 tab 组件。
