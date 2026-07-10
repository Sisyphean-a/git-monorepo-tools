---
doc_type: refactor-apply-notes
refactor: 2026-07-10-startup-timing
status: completed
---

# 启动时序重构执行记录

## 已完成

- 启动扫描改用可失效的写回租约；手动刷新、自动刷新和仓库操作入队时会使旧扫描失效。
- Git 代理和超时改为请求参数，透传到扫描、操作、AI 差异读取与自定义命令。
- Git 与自定义命令超时会终止整个进程树，避免派生进程继续占用工作区。

## 验证

- `npm run test:snapshot-coordinator`：通过。
- `go test ./snapshot -run "TestRun(Git|RepoCommand)TimeoutStopsChildProcess|TestRunRepoCommandStopsAtConfiguredTimeout" -count=1`：通过。
- `go test ./...`：曾有一次范围外终端会话测试抖动，定向连续复跑三次通过；`snapshot` 包通过。
- `npm run web:build`、`npm run build`：通过。
