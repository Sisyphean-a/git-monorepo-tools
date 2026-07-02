---
doc_type: issue-review
issue: 2026-07-02-default-scan-roots
status: passed
reviewer: self
reviewed: 2026-07-02
round: 1
---

# default-scan-roots 代码审查报告

## 1. Scope And Inputs

- Design: none（快速通道 issue，无单独 design）
- Checklist: none
- Evidence pack: none
- Gate results: none
- DoD results: none
- Implementation evidence: 用户原始诉求 + `default-scan-roots-fix-note.md`
- Diff basis: `git status --short` + 本轮目标文件 `git diff`
- Baseline dirty files: `.tmp/snapshot-tests/api.js`、`.tmp/snapshot-tests/api.test.js`、`snapshot/operations.go`、`snapshot/operations_test.go`、`snapshot/repo_resolution.go`、`src/app/App.tsx`、`src/app/api.test.ts`、`src/app/api.ts`、`src/app/components/ai-commit-panel.tsx`、`src/app/components/workspace.tsx`、`src/app/types.ts`、`.codestable/features/2026-07-02-add-discard-button/`，均不属于本次修复范围

### Independent Review

- Detection: 原生 sub-agent 工具与 `ocr` CLI 可用；但本轮用户未授权主动委派子代理，且工作区存在范围外脏改动，不能安全裸跑 OCR review
- 环节 A 独立隔离 Task agent: local-only + skipped-by-user
- 环节 B OCR CLI: skipped-scope-ambiguous
- OCR severity mapping: High→blocking/important, Medium→nit/suggestion, Low→discarded
- Merge policy: 本轮采用本地只读 review；未启用外部 reviewer，因此结论按 self-review fallback 落盘
- Gate effect: user-approved downgrade

## 2. Diff Summary

- 新增：`.codestable/issues/2026-07-02-default-scan-roots/default-scan-roots-fix-note.md`、`.codestable/issues/2026-07-02-default-scan-roots/worktree-override.md`
- 修改：`snapshot/service.go`、`snapshot/service_test.go`、`scripts/sync-real-data.mjs`、`src/app/components/settings-modal.tsx`
- 删除：none
- 未跟踪 / staged：未跟踪为本次 issue 目录；staged 为 none
- 风险热点：跨后端扫描逻辑 + 脚本快照逻辑 + 一处 UI 文案

## 3. Adversarial Pass

- 假设的生产 bug：删掉默认扫描根后，把“用户显式添加的目录”也一起扫没了
- 主动攻击过的反例：空配置、重复目录、空分类、脚本快照入口、设置页空状态
- 结果：none；空配置和显式目录保留都已被代码路径与新增测试覆盖

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

- 默认行为一旦跨 Go 服务和脚本各复制一份，就很容易出现“修一边漏一边”；这次同步收口是必要的。

### praise

- 回归测试直接卡住了这次需求的核心语义：空配置不扫描、显式配置仍保留。

## 5. Test And QA Focus

- QA 必须重点复核：首次启动且未添加任何目录时，仓库列表应为空；手动添加目录后应正常扫出仓库；删除目录后对应仓库应消失
- Evidence pack residual risks / gate warnings：review 采用 self fallback，已在报告记录
- 建议新增或加强的测试：none
- 不能靠 review 完全确认的点：前端实际交互态仅做了文案和逻辑推断，未起完整桌面界面手点验证

## 6. Residual Risk

- self-review fallback：本轮未启用独立子代理审查，残余风险主要在人工复核深度低于双环节标准；已用后端单测和脚本 smoke test 做补强

## 7. Verdict

- Status: passed
- Next: issue 来源进入提交收尾
