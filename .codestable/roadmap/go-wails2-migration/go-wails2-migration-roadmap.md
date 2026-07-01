---
doc_type: roadmap
slug: go-wails2-migration
status: active
created: 2026-07-01
last_reviewed: 2026-07-01
tags: [go, wails2, migration, desktop]
related_requirements: []
related_architecture: []
---

# 从 Node.js 本地 API 迁移到 Go + Wails2

## 1. 背景

当前项目的桌面端能力建立在 `React + Vite` 前端和 `scripts/vite-git-api.mjs` 注入的本地 API 之上。Git 扫描、批量 pull/push、AI commit、目录选择器、打开终端等能力都依赖 Node.js 脚本和 Vite 中间件，导致桌面宿主、业务能力和前端开发服务器强绑定。

这次迁移的目标不是重做产品，而是把“本地桌面能力”从 Node.js 脚本迁到 Go + Wails2，保留现有 UI 与交互语义，让应用以 Wails2 桌面宿主运行，并为后续打包、性能与宿主能力扩展建立稳定底座。

## 2. 范围与明确不做

### 本 roadmap 覆盖

- 以 Wails2 取代当前 Vite 本地 API 作为桌面宿主。
- 将 Git 扫描、仓库操作、批量操作、AI commit、系统动作迁移到 Go 服务。
- 把前端数据访问层从 `/api/*` fetch 改为 Wails 绑定调用。
- 更新开发、构建、打包入口，去除运行时对 Node 本地 API 的依赖。

### 明确不做

- 不重写现有 React UI，不在迁移过程中改视觉和交互文案。
- 不新增 Git 功能，不扩展当前 MVP 边界。
- 不在本 roadmap 内承诺 macOS / Linux 行为对齐；第一阶段以现有 Windows 行为等价为准。
- 不顺手刷新 requirements / ADR；若愿景文档与技术路线不一致，只记录观察项。

### Granularity Gate

| 判断项 | 结论 |
|---|---|
| 为什么不是 single feature | 迁移同时覆盖桌面宿主、业务后端、前端调用层、构建打包与系统桥接，存在多个可独立验收的交付和明确依赖 DAG。 |
| 为什么不是 brainstorm | 目标、边界和成功标准已明确，关键问题是如何分阶段迁移而不是是否要迁移。 |
| roadmap 边界 | 本次只覆盖“Node.js 本地 API → Go + Wails2 宿主”的技术迁移，不扩展产品能力。 |
| 最小闭环 | `wails-shell-bootstrap` 完成后，Wails 窗口能加载现有 React UI，并通过 Go 绑定返回真实仓库快照。 |

## 3. 模块拆分（概设）

```text
go-wails2-migration
├── Wails 宿主层：窗口生命周期、前端资源加载、绑定导出
├── Git 应用服务层：仓库扫描、状态构建、Git 命令与批量操作
├── 系统集成层：目录选择、打开文件夹、终端、冲突工具
├── AI Commit 服务层：暂存区 diff 预处理、提示词构建、模型请求
└── 前端适配层：React UI 与 Wails 绑定之间的数据访问与错误处理
```

### Wails 宿主层

- **职责**：承载桌面应用生命周期、开发/构建入口、前端资源加载、Go 方法绑定导出。
- **承载的子 feature**：`wails-shell-bootstrap`、`frontend-transport-cutover`
- **触碰的现有代码 / 模块**：新增 Wails2 工程骨架；替代 `vite.config.ts` 对本地 API 的依赖。

### Git 应用服务层

- **职责**：提供仓库扫描、状态快照、单仓库操作、批量 pull/push、日志读取等核心业务能力。
- **承载的子 feature**：`git-operation-parity`
- **触碰的现有代码 / 模块**：迁移 `scripts/sync-real-data.mjs` 中的 Git 与快照逻辑。

### 系统集成层

- **职责**：封装目录选择器与本机动作启动能力，隔离平台相关实现。
- **承载的子 feature**：`desktop-bridge-parity`
- **触碰的现有代码 / 模块**：迁移 `scripts/local-system.mjs`。

### AI Commit 服务层

- **职责**：基于暂存区生成 AI commit 候选，延续 staged-only 规则与现有设置结构。
- **承载的子 feature**：`ai-commit-parity`
- **触碰的现有代码 / 模块**：迁移 `scripts/ai-commit.mjs` 与 `sync-real-data.mjs` 中相关调用。

### 前端适配层

- **职责**：让现有 React UI 通过 Wails 绑定消费桌面能力，保持类型与错误语义稳定。
- **承载的子 feature**：`frontend-transport-cutover`、`node-removal-and-regression`
- **触碰的现有代码 / 模块**：调整 `src/app/api.ts`、`src/app/App.tsx` 及相关组件调用。

## 4. 模块间接口契约 / 共享协议（架构层详设）

### 4.1 Wails 绑定总入口

**方向**：前端适配层 → Wails 宿主层 → Go 应用服务层  
**形式**：Wails runtime bindings

**契约**：

```ts
type SnapshotRequest = {
  scanRoots: Array<{ path: string; category: string }>;
  pullStrategy: 'ff-only' | 'rebase' | 'merge';
  pushStrategy: 'upstream-only' | 'all';
};

type RepoAction =
  | 'stage-all'
  | 'unstage-all'
  | 'stage-file'
  | 'unstage-file'
  | 'commit'
  | 'pull'
  | 'push'
  | 'open-folder'
  | 'open-terminal'
  | 'open-conflicts';

type BatchAction = 'pull' | 'push';

GetSnapshot(request: SnapshotRequest): Promise<AppSnapshot>
MutateRepo(repoId: string, action: RepoAction, request: SnapshotRequest, body: Record<string, unknown>): Promise<AppSnapshot>
RunBatch(operation: BatchAction, request: SnapshotRequest): Promise<{ snapshot: AppSnapshot; results: PullResult[]; operation: 'pullAll' | 'pushAll' }>
GetRepoLog(repoId: string, request: SnapshotRequest): Promise<RepoLog | null>
GenerateCommitCandidates(repoId: string, request: SnapshotRequest, aiCommit: AICommitSettings, styleHint?: string): Promise<CommitCandidate[]>
PickFolder(): Promise<string | null>
```

**约束**：

- 前端不得再直接调用 `/api/*`。
- 所有业务错误统一以 rejected promise 返回，错误文案沿用当前中文语义。
- `SnapshotRequest` 的默认值必须与现有前端设置默认值保持一致。

### 4.2 AppSnapshot 共享数据结构

**方向**：Git 应用服务层 → 前端适配层  
**形式**：JSON DTO

**契约**：

```ts
type AppSnapshot = {
  scannedAt: string;
  categories: string[];
  repos: RepoDetail[];
  repoDetails: Record<string, RepoDetail>;
  selectedRepoId: string;
  pullResults: PullResult[];
  commitCandidates: Record<string, CommitCandidate[]>;
};

type RepoDetail = {
  id: string;
  name: string;
  branch: string;
  path: string;
  remote: string;
  category: string;
  modified: number;
  ahead: number;
  behind: number;
  conflicts: number;
  status: 'clean' | 'changed' | 'conflict' | 'checking';
  lastScan: string;
  files: FileChange[];
  stagedCount: number;
  unstagedCount: number;
  scannedAt: string;
  history: CommitSummary[];
};
```

**约束**：

- 字段名保持与现有 `src/app/types.ts` 一致，避免 UI 同时承受宿主迁移和数据重命名。
- `repos` 与 `repoDetails` 必须描述同一快照，不允许一端是旧值一端是新值。
- `selectedRepoId` 在无仓库时返回空字符串。

### 4.3 Git 命令执行契约

**方向**：Git 应用服务层 → 系统 Git 环境  
**形式**：Go 子进程调用

**契约**：

```text
GitCommand(repoPath, args[], timeout=60s) -> stdout
失败 -> error(message)
```

支持的命令族：

- `status --porcelain=v1 -b`
- `diff --numstat --no-renames`
- `diff --cached --numstat --no-renames`
- `add -A`
- `add -- <path>`
- `restore --staged .`
- `restore --staged -- <path>`
- `commit -m <message>`
- `pull --ff-only | --rebase | --no-rebase`
- `push`
- `log`
- AI commit 预处理所需 diff / show 命令

**约束**：

- 命令参数必须逐项传递，不拼接用户输入。
- 默认超时保持 60 秒；目录选择维持 120 秒上限。
- Git 标准错误若非空，优先回传为用户可见错误信息。

### 4.4 桌面系统动作契约

**方向**：前端适配层 → 系统集成层  
**形式**：Wails 绑定调用 + 平台适配

**契约**：

```ts
OpenFolder(path: string): Promise<void>
OpenTerminal(path: string): Promise<void>
OpenConflicts(path: string): Promise<void>
PickFolder(): Promise<string | null>
```

**约束**：

- 现阶段只要求 Windows 等价：资源管理器、PowerShell、`git mergetool`。
- `path` 为空或空白时必须显式失败。
- 这些动作不改变仓库状态，但调用完成后前端可复用当前快照刷新逻辑。

### 4.5 AI Commit 服务契约

**方向**：前端适配层 → AI Commit 服务层  
**形式**：Wails 绑定调用

**契约**：

```ts
type AICommitSettings = {
  apiKey: string;
  baseUrl: string;
  model: string;
  maxDiffChars: number;
  generateThree: boolean;
  stagedOnly: boolean;
  promptTemplate: string;
};

GenerateCommitCandidates(
  repoId: string,
  request: SnapshotRequest,
  aiCommit: AICommitSettings,
  styleHint?: string
): Promise<CommitCandidate[]>
```

**约束**：

- 只读取暂存区，不得把未暂存文件发送给模型。
- 二进制文件、锁文件、大文件继续走摘要化逻辑，不直接全量上传。
- 候选数量与现有前端展示约定保持一致。

## 5. 子 feature 清单

1. **wails-shell-bootstrap** — 建立 Wails2 宿主工程，加载现有 React UI，并通过 Go 绑定返回真实仓库快照。
   - 所属模块：Wails 宿主层、前端适配层
   - 依赖：无
   - 状态：done
   - 对应 feature：2026-07-01-wails-shell-bootstrap
   - 备注：这是最小闭环，同时冻结前后端快照契约与新的开发入口。

2. **git-operation-parity** — 将仓库扫描、状态构建、日志、stage/unstage/commit/pull/push/pullAll/pushAll 迁移到 Go 服务并保持现有错误语义。
   - 所属模块：Git 应用服务层
   - 依赖：`wails-shell-bootstrap`
   - 状态：planned
   - 对应 feature：未启动
   - 备注：完成后前端可通过 Go 获取真实仓库状态并执行核心 Git 操作。

3. **desktop-bridge-parity** — 将目录选择、打开文件夹、打开终端、打开冲突工具迁移到 Wails / Go 桥接。
   - 所属模块：系统集成层
   - 依赖：`wails-shell-bootstrap`
   - 状态：planned
   - 对应 feature：未启动
   - 备注：保持当前 Windows 行为，不扩展平台兼容性。

4. **ai-commit-parity** — 将 staged diff 预处理、Prompt 构建与模型调用迁移到 Go，并保持 staged-only 与候选输出结构不变。
   - 所属模块：AI Commit 服务层
   - 依赖：`git-operation-parity`
   - 状态：planned
   - 对应 feature：未启动
   - 备注：需复用现有前端设置结构，避免同时重做设置页。

5. **frontend-transport-cutover** — 用 Wails 绑定替换 `src/app/api.ts` 的 `/api/*` fetch 流程，并清理 Vite 本地 API 假设。
   - 所属模块：前端适配层、Wails 宿主层
   - 依赖：`git-operation-parity`、`desktop-bridge-parity`、`ai-commit-parity`
   - 状态：planned
   - 对应 feature：未启动
   - 备注：这一条完成后，React UI 不再依赖 Node 本地 API。

6. **node-removal-and-regression** — 删除运行时必需的 Node 本地 API 脚本与依赖，补齐 Wails 开发/构建文档，并完成一次桌面回归扫尾。
   - 所属模块：前端适配层、Wails 宿主层
   - 依赖：`frontend-transport-cutover`
   - 状态：planned
   - 对应 feature：未启动
   - 备注：回归范围至少覆盖首屏加载、单仓库操作、Pull All、Push All、AI commit、目录选择和本地打开动作。

**最小闭环**：第 1 条 `wails-shell-bootstrap` 做完后，可在 Wails 窗口中打开现有 UI，并看到来自 Go 绑定的真实仓库列表与状态。

### Goal Coverage Matrix

| Goal / completion signal | Covered by item(s) | Verification entry | Evidence type | Core? |
|---|---|---|---|---|
| 应用可在 Wails2 宿主中启动并显示真实仓库快照 | `wails-shell-bootstrap` | `wails dev` + 首屏手工验证 | command + screenshot / acceptance report | yes |
| 单仓库与批量 Git 操作不再依赖 Node 脚本 | `git-operation-parity` | Wails 绑定调用 + Git 操作烟测 | command + acceptance report | yes |
| 目录选择与本地系统动作在 Wails 环境可用 | `desktop-bridge-parity` | 手工触发目录选择 / 打开终端 / 打开冲突工具 | screenshot + acceptance report | no |
| AI commit 继续只基于暂存区生成候选 | `ai-commit-parity` | 暂存区用例手工验证 | prompt diff review + acceptance report | yes |
| 前端不再请求 `/api/*`，仍能完成原有工作流 | `frontend-transport-cutover` | 关键交互烟测 | code review + acceptance report | yes |
| Node 本地 API 运行时依赖被移除，Wails 构建可产出桌面包 | `node-removal-and-regression` | `wails build` + 文档核验 | command + diff review | yes |

## 6. 排期思路

先做 `wails-shell-bootstrap`，用最小真实链路冻结“Wails 宿主 + React UI + Go 快照绑定”的核心契约，避免后续 Git 服务和前端改造各自发明接口。随后优先完成 `git-operation-parity`，因为它是 Pull/Push、日志、暂存、提交和 AI commit 的共同依赖。系统动作与 AI commit 可在中段并行推进，但都必须在 `frontend-transport-cutover` 前完成，以保证前端切换时面对的是稳定绑定。最后单独保留 `node-removal-and-regression` 作为收口条目，处理脚本删除、命令更新与桌面回归，不把清理工作掺进功能迁移条目里。

Top 3 风险与缓解：

- **风险 1：前后端 DTO 漂移导致 UI 大面积联动修改。**
  - 缓解：第 1 条就冻结 `AppSnapshot` / settings / action 请求形状；前端适配层在第 5 条之前不改字段名。
- **风险 2：Git 命令迁移后错误语义变化，导致批量操作提示与现有行为不一致。**
  - 缓解：第 2 条明确沿用现有中文错误语义与跳过策略，acceptance 以典型失败路径做对照。
- **风险 3：迁移完成后仍保留 Node 运行时暗依赖，打包时才暴露问题。**
  - 缓解：把运行时清理与 `wails build` 验证独立成最后一条，不允许只在汇报中口头说明“理论可删”。

非显然依赖：

- 本机需具备 Wails2、Go 和现有前端依赖链的开发环境。
- 当前项目没有现成自动化测试或 typecheck 脚本，回归主要依赖构建命令与手工烟测。
- Windows 平台行为当前依赖 PowerShell / Explorer / 系统 Git，可执行路径与权限需在 Wails 环境复核。

关键假设：

- 现有 React UI 基本保留，只替换数据访问层。
- 用户接受第一阶段先实现 Windows 等价，不要求本 roadmap 同时交付跨平台支持。
- 现有 Node 脚本中的 Git 与 AI 逻辑可直接映射为 Go 服务，不需要先改产品边界。

基线与验证入口：

- 当前基线命令：`npm run dev`、`npm run build`、`npm run preview`。
- 迁移后核心验证入口：`wails dev`、`wails build`，以及保留的前端构建命令。
- 当前仓库缺少自动化测试安全网，因此每条 feature 需要在 acceptance 中明确列出命令与手工烟测证据。

交付物落点：

- Wails 工程骨架、Go 服务代码、前端绑定层、构建脚本、文档与运行命令。
- 删除或停用 `scripts/vite-git-api.mjs`、`scripts/local-system.mjs`、`scripts/sync-real-data.mjs` 等 Node 运行时桥接代码。

知识回写点：

- Wails2 开发/构建命令与环境坑应回写 `attention.md` 或独立沉淀。
- 若 Windows 平台桥接有固定约束，应在 acceptance 后沉淀到 `compound/` 或 `attention.md`。

## 7. 观察项

- `git-manager-requirements.md` / `.codestable/requirements/VISION.md` 仍将推荐技术路线写成 Electron + Vue 3，与本 roadmap 的 Go + Wails2 迁移方向不一致；若 roadmap 通过并启动实施，后续应由 `cs-req` 刷新愿景层文档。
- 当前 `features/2026-07-01-change-default-port`、`2026-07-01-localize-ui-copy`、`2026-07-01-remove-diff-pane` 若继续推进，需确认它们是否基于旧的 `/api/*` 假设。
