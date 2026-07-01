---
doc_type: feature-design-review
feature: 2026-07-01-node-removal-and-regression
status: passed
reviewed: 2026-07-01
round: 1
---

# node-removal-and-regression feature design 审查报告

## 1. Scope And Inputs

- Design: `.codestable/features/2026-07-01-node-removal-and-regression/node-removal-and-regression-design.md`
- Checklist: `.codestable/features/2026-07-01-node-removal-and-regression/node-removal-and-regression-checklist.yaml`
- Intent / brainstorm: none
- Roadmap: `.codestable/roadmap/go-wails2-migration/go-wails2-migration-roadmap.md`
- Related docs: `.codestable/attention.md`
- Code facts checked: `package.json`, `scripts/vite-git-api.mjs`, `scripts/local-system.mjs`, `scripts/sync-real-data.mjs`

### Independent Review

- Status: local-only
- Detection: local-only
- Provider / agent: none
- Raw output: none
- Merge policy: 未启用独立 reviewer；本轮为本地 gate 审查
- Gate effect: none

## 2. Design Summary

- Goal: 清理旧 Node 运行时桥接并做 Wails 构建/回归收口
- Key contracts: Wails 成为唯一桌面主入口，回归范围完整
- Steps: 4，风险在残留依赖与构建暴露问题
- Checks: 5，可追溯
- Baseline / validation: `wails build`、`wails dev`

## 3. Findings

### blocking

none

### important

none

### nit

- [ ] FDR-001 实现时应明确区分“运行时必需脚本”和“仍可保留的辅助脚本”，避免过度删除。

### suggestion

- [ ] FDR-002 回归阶段可复用此前 feature 的截图与场景，减少重复取证成本。

### learning

- 把清理和回归单独设为最后一条，可以防止“功能做完但构建挂掉”的常见收口缺口。

### praise

- 核心命令直接锁定 `wails build` 和 `wails dev`，符合最终交付目标。

## 4. User Review Focus

- 用户需要重点拍板：是否将 Wails 作为唯一桌面主入口。
- implement 需要重点遵守：先确认依赖再删除，不做粗暴清理。
- code review / QA / acceptance 需要重点复核：文档同步和完整桌面回归。

## 5. Evidence Confidence Ledger

| Check | Verdict | Evidence Class | Basis | Follow-up |
|---|---|---|---|---|
| Acceptance Coverage Matrix | pass | E | design 第 3 节 | none |
| DoD Contract | pass | E | design + checklist dod | none |
| Steps and checks traceability | pass | E | checklist 与 design 对齐 | none |
| Roadmap contract compliance | pass | C | roadmap 最后一条收口约束 | none |
| Validation and artifacts | pass | E | `wails build`、`wails dev` 与截图/差异证据 | 实现时补证据 |

Summary: E=4, C=1, H=0, H-only core checks=none。

## 6. Residual Risk

- 若某些旧脚本仍承担构建辅助职责，实现时需谨慎判定“移除”还是“保留但脱离运行态”。

## 7. Verdict

- Status: passed
- Next: 交给用户整体 review
