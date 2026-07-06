---
doc_type: issue-fix
issue: 2026-07-06-slow-refresh-and-mutate
path: fast-track
fix_date: 2026-07-06
tags: [performance, refresh, git, snapshot]
---

# 单仓库刷新与变更操作慢 修复记录

## 1. 问题描述

工作区里的刷新、暂存、取消暂存、提交、放弃更改这些明显是单仓库动作，但实现上走的是全工作区快照刷新，所以体感很慢。手动刷新尤其明显，因为它还会顺带刷新远端状态。

## 2. 根因

- 工作区里的刷新按钮复用的是 `GetSnapshot -> BuildAppSnapshot`，会重扫所有已发现仓库。
- `MutateRepo` 在执行完单仓库 Git 操作后，也会直接调用 `BuildAppSnapshot` 返回整包快照。
- 全量快照会对每个仓库都读取状态、diff、历史；手动刷新还会额外触发远端同步检查，所以单仓动作被全局扫描成本放大。

## 3. 修复方案

- 后端新增单仓库刷新与单仓库变更回包，返回当前仓库最新详情和提交候选，不再强制回整包快照。
- 前端新增单仓库快照合并逻辑，把当前仓库更新回填到现有快照，保留其他仓库状态不变。
- 工作区里的刷新按钮改为单仓库本地刷新，不再复用全局刷新。
- 侧边栏全局刷新、批量 pull/push、自动扫描仍保留全量扫描语义，不改现有职责边界。

## 4. 改动文件清单

- `snapshot/types.go`
- `snapshot/service.go`
- `snapshot/operations.go`
- `app.go`
- `src/app/types.ts`
- `src/app/api.ts`
- `src/app/snapshot-coordinator.ts`
- `src/app/use-snapshot-refresh.ts`
- `src/app/App.tsx`
- `src/app/components/workspace.tsx`
- `src/app/repo-snapshot-merge.ts`
- `src/app/repo-snapshot-merge.test.ts`
- `src/app/api.test.ts`
- `src/vite-env.d.ts`
- `frontend/wailsjs/go/main/App.js`
- `frontend/wailsjs/go/main/App.d.ts`
- `frontend/wailsjs/go/models.ts`

## 5. 验证结果

- `go test ./snapshot -count=1` 通过。
- `npm run test:snapshot-coordinator` 通过。
- `npm run build` 通过。
- 实测基线：
  - 全工作区本地刷新（11 个仓库）约 `1145ms`
  - 全工作区远端刷新（11 个仓库）约 `7636ms`
- 修复后语义：
  - 工作区里的刷新改成单仓库本地刷新路径。
  - 工作区里的暂存 / 取消暂存 / 提交 / 放弃更改 改成单仓库回包路径，不再等待全工作区重扫。

## 6. 遗留事项

- 目前单仓库合并后，全局 `scannedAt` 会更新为这次单仓库刷新时间；它表示“界面最近一次状态更新”，不再严格等价于“全工作区最近一次全量扫描时间”。
- 若后续要继续压全量扫描耗时，可以再拆“非当前仓库不读 history”或“手动刷新先本地、远端后台补”的方案，但不在本次范围。
