# 扫描刷新性能 Goal Review Packet

## 审查目标

对当前未提交改动做独立只读 code review，重点确认：

- 并发扫描没有引入错误顺序、重复刷新或状态覆盖问题。
- 前端所有会产出快照的动作已经收敛到统一串行点。
- 本地打开目录/终端/冲突文件不再触发无意义全量扫描，且 wiring 正确。
- 错误路径对用户可见，不再把失败静默吞掉或伪装成干净状态。

## 目标约束

- 不重做整体 UI 视觉。
- 允许轻度节流/合并刷新，但不能退化成手动刷新主导。
- 当前 goal 的完成标准：
  - 给出优化前后可复现耗时证据。
  - 自动刷新体感更顺滑，减少等待或抖动。
  - 完成独立 Task agent 功能验收。

## 本轮改动范围

后端：

- `snapshot/types.go`
- `snapshot/git.go`
- `snapshot/operations.go`
- `snapshot/service.go`
- `snapshot/service_test.go`
- `snapshot/snapshot_workers.go`
- `snapshot/benchmark_test.go`

前端：

- `src/app/api.ts`
- `src/app/api.test.ts`
- `src/app/settings.ts`
- `src/app/types.ts`
- `src/app/repo-status.ts`
- `src/app/repo-status.test.ts`
- `src/app/repo-log.ts`
- `src/app/repo-log.test.ts`
- `src/app/use-snapshot-refresh.ts`
- `src/app/snapshot-coordinator.ts`
- `src/app/snapshot-coordinator.test.ts`
- `src/app/App.tsx`
- `src/app/components/sidebar.tsx`
- `src/app/components/workspace.tsx`
- `src/app/components/workspace-parts.tsx`
- `src/vite-env.d.ts`
- `tsconfig.snapshot-tests.json`
- `package.json`
- `frontend/wailsjs/go/models.ts`

## 当前实现意图

1. 后端 `BuildAppSnapshot` 支持 `request.concurrency`，默认并发从 3 提到 5。
2. `snapshot/snapshot_workers.go` 为 repo snapshot 构建引入 worker 并发。
3. `concurrency_1` 直接走 `buildSnapshotsSequential(...)`，可作为旧串行扫描路径的可复放基线。
4. 前端所有会产出快照的刷新/批处理/仓库变更统一走 `createSnapshotCoordinator`。
5. 队列语义：
   - 正在执行刷新时，只有“队尾 refresh”会被合并，只保留最后一份 settings。
   - refresh 不会跨越已排队 task 错误合并。
   - snapshot task 与 refresh 串行，避免并发写入旧快照覆盖新快照。
6. `Workspace` 不再对 `mutateRepo(...)` 之后额外再做一次 `refreshSnapshot()`。
7. `open-folder/open-terminal/open-conflicts` 不再触发完整快照，也不再排队等待刷新完成。
8. repo 级 git 扫描失败会挂到对应 repo 的 `scanError/status=error`，并在列表与头部直接显示。
9. `scanError` 已进入默认 pull 结果语义和 pull / pullAll 安全门，不再把异常 repo 伪装成干净可拉取状态。
10. 初始扫描失败时空白态可见错误与重试按钮；加载后阶段错误显示在侧边栏底部。
11. 错误仓库不再显示绿色“干净”对勾；“查看日志”失败会走统一错误上报而不是静默吞掉。

## 需要重点攻击的点

1. 是否仍有遗漏的快照生产路径绕过 coordinator。
2. coordinator 在失败、连续触发、refresh/task 交错时，是否还可能：
   - 丢 refresh；
   - 用旧 settings 覆盖新 settings；
   - 因 reject 让后续队列停死；
   - 让调用方拿到错误的 resolve/reject。
3. 本地 repo 动作 wiring 是否真正走对绑定。
4. `scanError` 是否已真正进入 pull 安全门和默认结果语义。
5. 错误展示是否会误报、吞错或导致用户无从恢复。
6. 后端并发 snapshot 是否存在顺序依赖、竞态或资源泄漏风险。
7. 同名仓库排序是否仍可能抖动。

## 关键验证证据

基线手工扫描耗时（优化前，5 次）：

- 5109 ms
- 4585 ms
- 5049 ms
- 4554 ms
- 4743 ms

当前 benchmark（最近一轮 `go test ./snapshot -run ^$ -bench BenchmarkBuildAppSnapshot -benchtime=1x -count=1`）：

- `default`: `1669419600 ns/op`
- `concurrency_1`: `5324248500 ns/op`
- `concurrency_3`: `1736099400 ns/op`
- `concurrency_5`: `1153916200 ns/op`

当前自动化验证：

- `go test ./...`：passed
- `npm run test:snapshot-coordinator`：passed
- `npm run build`：passed
- `go test ./snapshot -run ^$ -bench BenchmarkBuildAppSnapshot -benchtime=1x -count=1`：passed

前端回归覆盖点（9 项）：

- 本地 repo 动作不会触发快照刷新
- `viewRepoLog` 失败会显式上报，不吞错
- `viewRepoLog` 成功后会清空最近错误
- 只有真正 `status=clean` 的 repo 才会显示绿色对勾
- 合并排队 refresh，并保留最新 settings
- refresh 与 snapshot task 串行
- refresh 不会跨越已排队 task 错误合并
- refresh 失败后仍可继续处理后续请求，并把错误显式暴露
- snapshot task 失败后仍可继续处理后续 refresh，并把错误显式暴露

后端回归覆盖点：

- `repoStatus("boom", ...) -> error`
- 同名 repo 排序使用 `repo.Path` 作为最终 tie-break
- 缺失/损坏 repo 的扫描失败会落到 `scanError/status=error`

## reviewer 输出要求

- 只读，不修改文件。
- 按 `blocking / important / nit / suggestion / residual-risk` 输出。
- 每条 finding 必须给出 `file:line` 或明确仓库事实。
- 请特别关注并发、时序、错误路径和性能回退。
