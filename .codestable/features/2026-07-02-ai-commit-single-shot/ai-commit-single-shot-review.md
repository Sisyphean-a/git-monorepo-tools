---
doc_type: feature-review
feature: 2026-07-02-ai-commit-single-shot
status: passed
reviewer: self
reviewed: 2026-07-02
round: 1
---

# ai-commit-single-shot 代码审查报告

## 1. Scope And Inputs

- Design: none（fastforward）
- Checklist: none（fastforward）
- Evidence pack: none
- Gate results: none
- DoD results: none
- Implementation evidence: 对话实现记录 + [ai-commit-single-shot-ff-note.md](/E:/github/git-monorepo-tools/.codestable/features/2026-07-02-ai-commit-single-shot/ai-commit-single-shot-ff-note.md)
- Diff basis: `git status --short` + 本轮相关 `git diff`
- Baseline dirty files: `.codestable/issues/2026-07-02-slow-git-mutate-operations/`、`scripts/sync-real-data.mjs`、`snapshot/benchmark_test.go`、`snapshot/operations.go`、`snapshot/operations_test.go`、`snapshot/repo_resolution.go`；`snapshot/types.go`、`src/app/api.ts`、`src/app/components/workspace.tsx` 先前已带 `repoPath` 相关改动，本轮在其基础上增量修改，未回滚既有内容

### Independent Review

- Detection: 当前环境存在 `multi_agent_v1.spawn_agent` 和 `ocr` CLI；`ocr llm test` 已通过
- 环节 A 独立隔离 Task agent: local-only + skipped-by-policy（当前会话规则禁止在用户未显式要求子 agent 时委派）
- 环节 B OCR CLI: skipped-scope-ambiguous（工作区存在本轮范围外 dirty/untracked 文件，`ocr review` 无文件白名单模式，无法只审本轮 scope）
- OCR severity mapping: High→blocking/important，Medium→nit/suggestion，Low→discarded
- Merge policy: 本轮仅采用主 agent 本地事实审查；未把外部未核验证据并入 verdict
- Gate effect: 采用 `self` fallback；commit gate 需 `CODESTABLE_ALLOW_SELF_REVIEW_FALLBACK=1`

## 2. Diff Summary

- 新增：`snapshot/ai_client.go`、`snapshot/ai_test.go`、`.codestable/features/2026-07-02-ai-commit-single-shot/*`
- 修改：`app.go`、`frontend/wailsjs/go/main/App.*`、`snapshot/ai.go`、`src/app/App.tsx`、`src/app/api.ts`、`src/app/api.test.ts`、`src/app/components/ai-commit-panel.tsx`、`src/app/components/settings-modal.tsx`、`src/app/components/workspace.tsx`、`src/app/settings.ts`、`src/app/types.ts`、`src/vite-env.d.ts`
- 删除：none
- 未跟踪 / staged：未跟踪为本轮 feature 目录与 `snapshot/ai_client.go`、`snapshot/ai_test.go`；staged 为 none
- 风险热点：UI 状态时序、Wails 绑定、AI 提供方兼容性

## 3. Adversarial Pass

- 假设的生产 bug：首次 AI 生成成功后，自动扫描把输入框状态重置，数秒后回退到默认内容
- 主动攻击过的反例：`repo.scannedAt` 定时变化、AI 返回 fenced JSON / 裸字符串、非 DeepSeek 配置被 DeepSeek 私有参数打坏、切换仓库时旧消息残留
- 结果：相关风险已在本轮实现中显式处理；未发现需要升级为 findings 的剩余问题

## 4. Findings

### blocking

none

### important

none

### nit

none

### suggestion

none

### learning

- 直接复用 RepoMirror 的请求协议时，DeepSeek 专有字段不能无条件下发到本项目所有可配置模型；这类 provider capability 必须做条件化处理

### praise

- `src/app/components/workspace.tsx` 把“同步 staged 状态”和“清空提交信息”拆成两个 effect，直接命中首轮生成被刷新覆盖的根因
- `snapshot/ai_client.go` 对 JSON、code fence、单行文本都做了容错解析，单条直出链路比原先更稳

## 5. Test And QA Focus

- QA 必须重点复核：首次点击 AI 生成后等待一次自动扫描周期，输入框内容不应回退；再次点击生成应直接覆盖输入框；切换仓库后输入框应清空；DeepSeek 与至少一个非 DeepSeek 配置各验证一次
- Evidence pack residual risks / gate warnings：none
- 建议新增或加强的测试：后续可补一个前端组件级状态测试，专门覆盖 `scannedAt` 刷新后提交信息保持不变的场景
- 不能靠 review 完全确认的点：真实桌面端 Wails 运行时的首轮点击路径、本地实际 AI 服务对各自 `baseUrl` 的兼容性

## 6. Residual Risk

- 当前没有组件级自动化测试直接覆盖“生成后跨自动扫描保留内容”的 UI 时序，只靠本地代码审查和构建验证；QA 需要按上节手工走一遍
- 非 DeepSeek 配置已避免注入 DeepSeek 私有字段，但真实第三方兼容层的请求语义仍需至少实测一次

## 7. Verdict

- Status: passed
- Next: feature-ff 收尾提交；若继续走 gate，使用 `CODESTABLE_ALLOW_SELF_REVIEW_FALLBACK=1` 后重跑 commit gate
