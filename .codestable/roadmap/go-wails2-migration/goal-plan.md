# go-wails2-migration goal 执行总览

- Roadmap: `.codestable/roadmap/go-wails2-migration/go-wails2-migration-roadmap.md`
- Items: `.codestable/roadmap/go-wails2-migration/go-wails2-migration-items.yaml`

## Feature 执行顺序

1. `wails-shell-bootstrap`：建立 Wails2 宿主并跑通首屏真实快照
2. `git-operation-parity`：迁移仓库扫描与核心 Git 操作到 Go
3. `desktop-bridge-parity`：迁移目录选择与本机动作桥接
4. `ai-commit-parity`：迁移 staged diff 与 AI commit 生成
5. `frontend-transport-cutover`：用 Wails 绑定替换前端 `/api/*` fetch
6. `node-removal-and-regression`：移除 Node 运行时桥接并完成构建/回归收口

## Feature 性质

- `wails-shell-bootstrap`: mixed
- `git-operation-parity`: functional
- `desktop-bridge-parity`: functional
- `ai-commit-parity`: functional
- `frontend-transport-cutover`: mixed
- `node-removal-and-regression`: non-functional

## Roadmap 级核心验收路径

- `wails dev` 启动后可显示现有 React UI，且首屏仓库快照来自 Go 绑定。
- 单仓库 stage/commit/pull/push、批量 pullAll/pushAll 在桌面运行态通过 Go 服务执行。
- 目录选择、打开文件夹、打开终端、打开冲突工具在 Wails 运行态可触发。
- AI commit 只读取 staged diff，并在桌面运行态返回候选。
- 前端运行态不再请求 `/api/*`。
- `wails build` 可成功产出桌面包。

## 关键假设

- 本机具备 Wails2、Go、Node 和系统 Git。
- 第一阶段以 Windows 等价为准。
- 现有 React UI 基本保留，只替换宿主与数据访问层。

## Top 3 风险与缓解

- 宿主与 DTO 漂移。
  - 缓解：先完成 `wails-shell-bootstrap`，后续所有 feature 固定复用 `AppSnapshot` 契约。
- Git 与 AI 迁移后行为不等价。
  - 缓解：review / QA / acceptance 必须对照现有中文错误、跳过语义与 staged-only 约束。
- 旧 Node 运行时依赖残留到最后。
  - 缓解：`frontend-transport-cutover` 完成后，再由 `node-removal-and-regression` 单独执行清理与构建验证。

## 必跑验证命令集合

- `wails dev`
- `wails build`

## 最终聚合测试命令集合

- `wails dev`
- `wails build`

说明：当前仓库没有现成的自动化测试或 typecheck 命令入口；本 roadmap 以桌面运行态命令、差异核验和手工烟测作为核心证据。

## 预检策略

- 每个 feature impl 前先确认 `wails dev` 是否可启动当前基线。
- 涉及构建或清理时，先记录当前工作区状态，再执行目标命令。
- 若基线命令已红，必须区分既有问题和本 feature 引入问题，不得混算。

## DoD Policy

- 每个 feature 必须完成 design 对应 checklist steps。
- 每个 feature 必须有 review、QA、acceptance 报告且 `status: passed`。
- 每个 feature acceptance 后要回写 roadmap item 与 goal-state，并做 scoped commit。
- 最终必须通过 roadmap goal audit，才算完成。

## Gate Policy

- 执行 `.codestable/roadmap/go-wails2-migration/goal-protocol-gates.md`。
- `scope-gate`、`dod-runner`、`evidence-pack` 等 gate 如缺脚本，视为项目骨架问题，不得伪装通过。
- 协议型 gate 由对应阶段报告与 evidence 承接，不能跳过核心 gate。

## Provider Policy

- `archguard` / `meta-cc` unavailable 不自动阻塞，但必须在 review / QA / audit 解释。
- provider warning 必须落入 review / QA / audit 结论。
- 未解释的核心 provider 风险可阻塞通过。

## 验证工具缺失时的恢复策略

- 只允许安装真实依赖或补齐既有 runner 配置。
- 不允许新增同名 shim、伪造命令或模拟通过结果。

## 最终审计核验的交付物类型

- Wails/Go 宿主代码
- 前端传输层改动
- review / QA / acceptance 报告
- roadmap 与 goal-state 回写
- 运行命令与文档更新

## 最终审计必跑项

- `python .codestable/tools/codestable-goal-consistency-gate.py --roadmap .codestable/roadmap/go-wails2-migration`
- 聚合 `goal-evidence-summary`、provider warnings、E/C/H summary 和 H-only core checks
