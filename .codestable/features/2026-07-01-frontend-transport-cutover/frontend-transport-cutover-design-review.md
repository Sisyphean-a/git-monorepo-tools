---
doc_type: feature-design-review
feature: 2026-07-01-frontend-transport-cutover
status: passed
reviewed: 2026-07-01
round: 1
---

# frontend-transport-cutover feature design 审查报告

## 1. Scope And Inputs

- Design: `.codestable/features/2026-07-01-frontend-transport-cutover/frontend-transport-cutover-design.md`
- Checklist: `.codestable/features/2026-07-01-frontend-transport-cutover/frontend-transport-cutover-checklist.yaml`
- Intent / brainstorm: none
- Roadmap: `.codestable/roadmap/go-wails2-migration/go-wails2-migration-roadmap.md`
- Related docs: `.codestable/attention.md`
- Code facts checked: `src/app/api.ts`, `src/app/App.tsx`

### Independent Review

- Status: local-only
- Detection: local-only
- Provider / agent: none
- Raw output: none
- Merge policy: 未启用独立 reviewer；本轮为本地 gate 审查
- Gate effect: none

## 2. Design Summary

- Goal: 把前端本地能力访问统一切到 Wails 绑定
- Key contracts: `src/app/api.ts` 保持同名函数语义，移除 `/api/*` 依赖
- Steps: 4，风险在残留 HTTP 假设与错误语义漂移
- Checks: 5，可追溯
- Baseline / validation: `wails dev`

## 3. Findings

### blocking

none

### important

none

### nit

- [ ] FDR-001 实现阶段建议补一条搜索证据，证明仓库中已无运行态 `/api/` 本地调用残留。

### suggestion

- [ ] FDR-002 若 `src/app/api.ts` 改动过多，可在实现结束后再评估是否拆出 binding adapter，但不作为本 feature 前置。

### learning

- 用单一传输入口承接迁移是合理的，可以把 UI 爆炸半径压到最低。

### praise

- 明确拒绝双通道回退，避免把失败隐藏成“偶尔还能跑”。

## 4. User Review Focus

- 用户需要重点拍板：是否完全切断 `/api/*` 运行时依赖。
- implement 需要重点遵守：组件接口语义不变。
- code review / QA / acceptance 需要重点复核：关键交互烟测与错误路径。

## 5. Evidence Confidence Ledger

| Check | Verdict | Evidence Class | Basis | Follow-up |
|---|---|---|---|---|
| Acceptance Coverage Matrix | pass | E | design 第 3 节 | none |
| DoD Contract | pass | E | design + checklist dod | none |
| Steps and checks traceability | pass | E | checklist 与 design 对齐 | none |
| Roadmap contract compliance | pass | C | roadmap transport 约束 | none |
| Validation and artifacts | pass | E | `wails dev` + 搜索/截图证据 | 实现时补证据 |

Summary: E=4, C=1, H=0, H-only core checks=none。

## 6. Residual Risk

- 若个别组件绕过 `src/app/api.ts` 直接发请求，需在实现阶段通过搜索彻底排查。

## 7. Verdict

- Status: passed
- Next: 交给用户整体 review
