---
doc_type: issue-review
issue: 2026-07-02-slow-git-mutate-operations
status: blocked
reviewer: ocr
reviewed: 2026-07-02
round: 1
---

# slow-git-mutate-operations 代码审查报告

## 1. Scope And Inputs

- Design: none（issue 快速通道）
- Checklist: none
- Evidence pack: none
- Gate results: none
- DoD results: none
- Implementation evidence: `.codestable/issues/2026-07-02-slow-git-mutate-operations/slow-git-mutate-operations-fix-note.md` 与本轮对话实现记录
- Diff basis: `git status --short` + 当前工作区 diff
- Baseline dirty files: none

### Independent Review

- Detection: 当前会话无可用 subagent 启动入口；`ocr` CLI 可用且连接成功。
- 环节 A 独立隔离 Task agent: local-only + not-available
- 环节 B OCR CLI: completed
- OCR severity mapping: High→blocking/important，Medium→nit/suggestion，Low→discarded
- Merge policy: OCR 结果已逐条本地核验；其中 1 条语义问题、1 条重复校验问题、1 条测试覆盖问题均已在本轮修复后复核
- Gate effect: commit gate 仍要求 Task agent reviewer；当前仅完成 OCR + 本地核验，流程上不能放行

## 2. Diff Summary

- 新增：`snapshot/repo_resolution.go`、`snapshot/operations_test.go`、`.codestable/issues/2026-07-02-slow-git-mutate-operations/slow-git-mutate-operations-fix-note.md`、`.codestable/issues/2026-07-02-slow-git-mutate-operations/slow-git-mutate-operations-review.md`、`.codestable/issues/2026-07-02-slow-git-mutate-operations/worktree-override.md`
- 修改：`snapshot/operations.go`、`snapshot/types.go`、`snapshot/benchmark_test.go`、`src/app/api.ts`、`src/app/components/workspace.tsx`、`scripts/sync-real-data.mjs`
- 删除：none
- 未跟踪 / staged：未跟踪为本次 issue 目录与 `snapshot/operations_test.go`；staged none
- 风险热点：Go 后端 Git 操作入口、前端单仓库动作传参、镜像脚本一致性

## 3. Adversarial Pass

- 假设的生产 bug：`repoPath` hint 改变原有仓库定位语义，导致错误路径时直接失败或错误命中
- 主动攻击过的反例：hint 缺失、hint 与 `repoId` 不匹配、`commit` 走 path-only 分支、`pull` 走 targeted snapshot 分支、无 path hint 时回退全量定位
- 结果：OCR 指出的语义变更、重复校验和测试缺口均已补齐；当前未发现新的 blocking / important 问题

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

- 把“优化 hint”与“权威定位逻辑”分开是必要的；hint 失效时应保持旧语义，而不是把优化路径变成硬前置。

### praise

- `resolveRepoForActionWithLoad()` + 针对三条分支的单测把这次性能修复的关键行为锁住了，后续再改解析链路时更不容易回归。

## 5. Test And QA Focus

- QA 必须重点复核：在包含多个 sibling repo 的工作区里手工验证 `stage-all`、单文件暂存、`commit`；同时验证 `pull` / `push` 的原有前置校验未变。
- Evidence pack residual risks / gate warnings：none
- 建议新增或加强的测试：none（本轮已补 repo 解析分支单测）
- 不能靠 review 完全确认的点：真实大工作区下的体感收益仍取决于操作后那次全量 `BuildAppSnapshot()`

## 6. Residual Risk

- 操作后的全量快照刷新仍是主要剩余成本之一，但这属于当前返回协议设计，不是本轮回归风险。

## 7. Verdict

- Status: blocked
- Next: 需要补一轮 Task agent reviewer 后重跑本审查，才能进入提交收尾
