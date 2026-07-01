---
doc_type: feature-design-review
feature: 2026-07-01-ai-commit-parity
status: passed
reviewed: 2026-07-01
round: 1
---

# ai-commit-parity feature design 审查报告

## 1. Scope And Inputs

- Design: `.codestable/features/2026-07-01-ai-commit-parity/ai-commit-parity-design.md`
- Checklist: `.codestable/features/2026-07-01-ai-commit-parity/ai-commit-parity-checklist.yaml`
- Intent / brainstorm: none
- Roadmap: `.codestable/roadmap/go-wails2-migration/go-wails2-migration-roadmap.md`
- Related docs: `.codestable/attention.md`
- Code facts checked: `src/app/api.ts`, `src/app/types.ts`, `scripts/sync-real-data.mjs`

### Independent Review

- Status: local-only
- Detection: local-only
- Provider / agent: none
- Raw output: none
- Merge policy: 未启用独立 reviewer；本轮为本地 gate 审查
- Gate effect: none

## 2. Design Summary

- Goal: 迁移 AI commit 生成流程到 Go
- Key contracts: staged-only、摘要化、候选数组结构不变
- Steps: 4，风险在模型输入边界
- Checks: 5，可追溯
- Baseline / validation: `wails dev`

## 3. Findings

### blocking

none

### important

none

### nit

- [ ] FDR-001 acceptance 阶段应保留一个“有未暂存但无暂存”样本，专门验证 staged-only。

### suggestion

- [ ] FDR-002 若模型调用在 Go 中需新 HTTP 封装，实现时可单独留意超时和错误文案对齐。

### learning

- 把摘要化列为硬约束而不是实现细节，能避免“先跑通后补安全边界”的坏路径。

### praise

- 方案明确避免把设置页重构混入 AI 迁移，边界清楚。

## 4. User Review Focus

- 用户需要重点拍板：是否维持现有 AI 交互语义不变。
- implement 需要重点遵守：未暂存内容绝不进入模型输入。
- code review / QA / acceptance 需要重点复核：摘要化与空暂存错误路径。

## 5. Evidence Confidence Ledger

| Check | Verdict | Evidence Class | Basis | Follow-up |
|---|---|---|---|---|
| Acceptance Coverage Matrix | pass | E | design 第 3 节 | none |
| DoD Contract | pass | E | design + checklist dod | none |
| Steps and checks traceability | pass | E | checklist 与 design 对齐 | none |
| Roadmap contract compliance | pass | C | roadmap AI 约束 | none |
| Validation and artifacts | pass | E | `wails dev` + diff review 证据已定义 | 实现时补证据 |

Summary: E=4, C=1, H=0, H-only core checks=none。

## 6. Residual Risk

- 实际模型接口的超时和网络失败语义仍需实现阶段对齐现有行为。

## 7. Verdict

- Status: passed
- Next: 交给用户整体 review
