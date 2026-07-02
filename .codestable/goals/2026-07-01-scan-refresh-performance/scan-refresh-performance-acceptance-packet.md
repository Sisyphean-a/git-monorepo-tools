# 扫描刷新性能 Goal Acceptance Packet

## 目标

确认当前实现是否满足以下 acceptance：

1. 给出仓库扫描与自动刷新链路的可复现耗时对比。
2. 减少自动刷新带来的界面等待或抖动，体感更顺滑。
3. 只引入轻度节流或合并刷新，不退化成手动刷新主导。
4. 错误路径比之前更显式可见。

## 功能性证据

### 1. 扫描耗时证据

优化前手工扫描 5 次：

- 5109 ms
- 4585 ms
- 5049 ms
- 4554 ms
- 4743 ms

当前 benchmark（最近一轮）：

- `default`: `1669419600 ns/op`
- `concurrency_1`: `5324248500 ns/op`
- `concurrency_3`: `1736099400 ns/op`
- `concurrency_5`: `1153916200 ns/op`

含义：

- `concurrency_1` 在代码里直接走串行 `buildSnapshotsSequential(...)`，等价于旧实现口径，可复放。
- 默认路径已接近 `concurrency=5`。
- 相比串行 `concurrency_1`，当前默认扫描约快 3-4 倍。

### 2. 交互链路证据

以下慢路径已被移除或收敛：

- `Workspace` 的仓库变更动作不再执行 `mutateRepo -> refreshSnapshot` 双重扫描。
- 所有会产出快照的刷新/批处理/仓库变更统一经过 `snapshot-coordinator` 串行调度。
- 连续 refresh 会合并，只保留最后一份 settings，避免同一时间段重复扫描。
- refresh 不会跨越已排队 snapshot task 错合并，因此不会把较新的 refresh 排到旧 task 前面。
- `open-folder/open-terminal/open-conflicts` 不再触发完整扫描，也不会被刷新队列阻塞。

### 3. 失败可见性证据

- 首次扫描失败：空白态显示错误文案与“重试扫描”按钮。
- 加载完成后的失败：侧边栏底部显示最近错误。
- 单仓库 git 扫描失败：repo 会带 `scanError/status=error`，并在列表与仓库头部直接显示。
- 错误仓库不会再显示绿色“干净”对勾，避免把失败状态伪装成 clean。
- “查看日志”失败会进入统一错误提示路径，不再静默无反馈。
- `scanError` 还会进入默认 pull 结果语义与 pull / pullAll 安全门，不再把异常 repo 伪装成干净可拉取状态。
- coordinator 测试验证：refresh 失败和 snapshot task 失败后，后续请求都仍能继续执行。

## 已跑验证

- `go test ./...`：passed
- `npm run test:snapshot-coordinator`：passed
- `npm run build`：passed
- `go test ./snapshot -run ^$ -bench BenchmarkBuildAppSnapshot -benchtime=1x -count=1`：passed

## 建议验收视角

- 是否认可 `concurrency_1` 作为旧串行路径基线，与当前默认路径形成可复放对照。
- 是否认可重复扫描消除、队列串行化和本地动作去扫描化，足以支撑“等待/抖动减少”的产品结论。
- 是否认可错误路径现在已从“静默/伪装干净”变为“repo 级显式暴露 + 拉取安全门阻断”。

## 残余风险

- 未做桌面 GUI 实机自动化，因此“体感改善”主要由重复扫描消除、队列语义和耗时数据侧证。
- benchmark 样本来自当前本地仓库集合，绝对值不代表所有机器，但相对趋势清晰。
- `concurrency_1` 等价的是旧串行扫描编排路径，不是完整历史版本逐字回放基线。

## auditor 输出要求

- 只读，不修改文件。
- 输出 `pass / fail / inconclusive` verdict。
- 明确引用 acceptance criteria，并说明依据与残余风险。
