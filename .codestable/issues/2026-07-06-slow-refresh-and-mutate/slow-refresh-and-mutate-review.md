---
doc_type: issue-review
issue: 2026-07-06-slow-refresh-and-mutate
status: passed
reviewer: self
reviewed: 2026-07-06
round: 1
---

# slow-refresh-and-mutate 代码审查报告

## 1. Scope And Inputs

- Design: none（issue 快速通道）
- Checklist: none
- Evidence pack: none
- Gate results: none
- DoD results: none
- Implementation evidence: `.codestable/issues/2026-07-06-slow-refresh-and-mutate/slow-refresh-and-mutate-fix-note.md` 与本轮对话实现记录
- Diff basis: `git status --short` + 当前工作区 diff
- Baseline dirty files: `.tmp/snapshot-tests/*` 为本轮测试编译产物

### Independent Review

- Detection: 当前会话无可用独立 subagent / Task agent reviewer 启动入口，也未提供 OCR CLI 审查链路。
- 环节 A 独立隔离 Task agent: not-available
- 环节 B OCR CLI: not-available
- Merge policy: 本轮为 local/self review，结论仅基于仓库事实、测试结果与本地 diff 核验。
- Residual gate note: `reviewer=self` 仅用于补齐 review 证据；若后续严格要求独立 reviewer，需再补一轮外部审查。

## 2. Diff Summary

- 新增：单仓库快照更新模型、单仓库刷新接口、前端快照合并逻辑、对应测试与 issue 记录
- 修改：单仓库 Git 操作回包链路、工作区刷新链路、Wails 绑定声明、测试脚本
- 删除：none
- 风险热点：单仓库回包与前端快照合并后的状态一致性；工作区刷新与全局刷新语义分离

## 3. Adversarial Pass

- 主动攻击点 1：单仓更新后把其他仓库状态覆盖坏
  - 结果：已用 `mergeRepoSnapshotUpdate` 仅更新目标仓库；新增合并测试覆盖
- 主动攻击点 2：工作区刷新误走全局远端刷新
  - 结果：工作区刷新显式改成 `refreshRepo(..., { refreshRemotes: false })`
- 主动攻击点 3：抽屉里的单仓重试仍走旧整包路径
  - 结果：已改成与工作区单仓动作一致的快路

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

- 单仓快照合并如果写死项目路径或偷偷改变侧边栏排序，很容易把性能修复变成行为回归；这类细节必须靠测试锁住。

### praise

- 这次改动把“全局扫描”和“单仓刷新”职责拆清了，性能收益直接，范围也收得住。

## 5. Test And QA Focus

- 已验证：
  - `go test ./snapshot -count=1`
  - `npm run test:snapshot-coordinator`
  - `npm run build`
- QA 重点：
  - 工作区内点击刷新，应只刷新当前仓库，不影响其他仓库已加载状态
  - `全部暂存`、单文件暂存/取消暂存、`提交`、`放弃更改` 后，当前仓库状态应立即更新
  - 侧边栏全局刷新仍应保持全工作区扫描语义

## 6. Residual Risk

- 当前 `scannedAt` 在单仓更新后表示“最近一次界面状态更新时间”，不再严格等同于“全工作区最近一次全量扫描时间”；若产品上要区分这两个概念，后续需单独建模。

## 7. Verdict

- Status: passed
- Next: 本轮 issue 修复可以进入提交收尾；若要严格满足独立 reviewer gate，再补一轮外部 review 即可
