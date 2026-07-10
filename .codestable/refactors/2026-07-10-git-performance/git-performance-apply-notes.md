---
doc_type: refactor-apply-notes
refactor: 2026-07-10-git-performance
---

# Git 性能重构执行记录

## 步骤 1: 提交历史与日志按需读取
- 完成时间: 2026-07-10
- 改动文件: `snapshot/service.go`、`snapshot/git.go`、`snapshot/operations.go`、`src/app/components/repo-history-tab.tsx`、`src/app/components/workspace.tsx`
- 验证结果: 基础快照和历史分页都显式返回空数组；历史页使用既有分页接口并在仓库详情更新后重新加载；日志摘要测试通过。
- 偏离: 无。

## 步骤 2: 未跟踪目录汇总
- 完成时间: 2026-07-10
- 改动文件: `snapshot/git.go`、`snapshot/git_test.go`
- 验证结果: 目录只返回一条路径且不含子文件行数、大小统计的单测通过。
- 偏离: 无。

## 步骤 3: 交互操作与后台刷新分流
- 完成时间: 2026-07-10
- 改动文件: `src/app/snapshot-coordinator.ts`、`src/app/snapshot-coordinator.test.ts`
- 验证结果: 活跃刷新期间的交互任务立即运行，旧刷新结果不写回；前端定向测试通过。
- 偏离: 无。

## 步骤 4: 批量同步受控并发与目标回读
- 完成时间: 2026-07-10
- 改动文件: `snapshot/batch.go`、`snapshot/operations.go`、`snapshot/types.go`、`src/app/App.tsx`、`src/app/api.ts`、`frontend/wailsjs/go/models.ts`
- 验证结果: 批量并发上限测试通过；仅 `pulled` 与 `pushed` 仓库回读并合并。
- 偏离: 无。

## 步骤 5: 验证
- 完成时间: 2026-07-10
- 改动文件: 测试与构建产物未纳入版本控制。
- 验证结果: `go test ./... -count=1`、`npm run test:snapshot-coordinator`、`npm run web:build` 均通过。
- 偏离: 项目根 TypeScript project-reference 检查因既有配置错误无法运行；已由 Vite 生产构建和定向 TypeScript 测试覆盖本轮改动。
