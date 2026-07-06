---
doc_type: issue-fix
issue: 2026-07-06-remote-ahead-detection
path: fast-track
fix_date: 2026-07-06
tags: [git, remote, snapshot, auto-scan]
---

# 远端检查阻塞首屏扫描 修复记录

## 1. 问题描述

上次修复后，应用启动时会在首屏扫描阶段直接对仓库执行远端同步。这样虽然能及时识别远端新提交，但首屏必须等这些 `fetch` 完成，仓库多或网络慢时就会一直卡在“正在扫描仓库...”页面，用户进不去主界面。

## 2. 根因

远端同步被塞进了首个 `GetSnapshot` 的同步链路里，而前端在拿到第一份快照前一直显示加载页；因此启动阶段既要做本地状态扫描，又要等待所有仓库的远端检查结束。

## 3. 修复方案

把快照刷新拆成两阶段：

- 首屏首次刷新只做本地快速扫描，不做远端同步，先把主界面挂出来。
- 页面进入后，再后台排一次“带远端同步”的刷新，用它更新 `ahead/behind`。

后端快照请求新增 `refreshRemotes` 开关，前端刷新队列和 API 请求会显式传这个开关；镜像脚本实现同步对齐。

## 4. 改动文件清单

- `src/app/api.ts`
- `src/app/api.test.ts`
- `src/app/snapshot-coordinator.ts`
- `src/app/snapshot-coordinator.test.ts`
- `src/app/use-snapshot-refresh.ts`
- `snapshot/git.go`
- `snapshot/service.go`
- `snapshot/snapshot_workers.go`
- `snapshot/service_test.go`
- `snapshot/types.go`
- `scripts/sync-real-data.mjs`

## 5. 验证结果

- `npm run test:snapshot-coordinator` 通过。
- `npm run web:build` 通过。
- `go test ./snapshot/...` 通过。
- `go test ./...` 通过。
- `node --check scripts/sync-real-data.mjs` 通过。
- 新增前端测试覆盖“快扫请求默认不刷远端、后台刷新可显式开启远端同步”和“刷新队列保留远端刷新意图”。
- 保留后端回归测试覆盖“本地未手动 fetch，但远端多了 1 个提交，启用远端刷新后应识别 `behind=1`”场景。

## 6. 遗留事项

未做 Wails 桌面实机可视化验证；本次只完成了前后端自动化验证与 Web 构建验证。
