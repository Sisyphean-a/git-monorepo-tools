# 需求文档：多仓库 Git 管理工具

> 项目暂定名：**VibeGit Desk**  
> 文档用途：把本文档交给代码 AI，让它按文档生成第一版可运行的桌面端 Git 管理工具。  
> 推荐技术路线：**Electron + Vue 3 + TypeScript + Vite**。原因是 Git 操作需要访问本地文件系统和执行 Git 命令，Electron 的 Node 能力最直接；Vue 3 对前端开发者也更友好。后续如果追求体积和性能，可以迁移到 Tauri。

---

## 1. 背景

AI Vibe Coding 之后，开发者经常同时打开多个 AI 编码会话，让它们在多个仓库中并发修改代码。问题是：

- 仓库太多，容易忘记哪个仓库改了代码。
- 多台电脑开发时，容易忘记 pull / push。
- AI 改了很多文件后，手写 commit message 很烦。
- 一个个仓库打开 IDE 检查状态成本太高。
- Git 历史如果不及时提交，很容易混成一坨。

因此需要一个统一的 Git 管理工作台：可以集中查看多个仓库状态，并完成暂存、AI 生成提交信息、提交、推送、拉取和批量同步。

---

## 2. 产品目标

做一个高频、轻量、可靠的本地桌面 Git 管理工具。

核心目标：

1. 多仓库状态集中可见。
2. 当前仓库可以完成常用 Git 工作流：暂存、生成提交信息、提交、推送、拉取。
3. 支持 AI 根据暂存区 diff 生成提交信息。
4. 支持 Pull All / Push All，降低多电脑、多仓库同步成本。
5. 仓库状态定时刷新，减少“忘记提交/忘记推送”的情况。

---

## 3. MVP 功能范围

### 3.1 必做功能

- 添加本地 Git 仓库。
- 新建分类、编辑分类、把仓库放入分类。
- 左侧仓库列表展示状态：
  - clean
  - 有未提交改动
  - 有暂存改动
  - 有未跟踪文件
  - ahead，需要 push
  - behind，需要 pull
  - ahead + behind，即分叉状态
  - conflict
  - Git 操作失败
- 右侧显示当前仓库的差异列表。
- 支持按文件暂存、取消暂存、全部暂存、全部取消暂存。
- 支持查看文件 diff。
- 支持基于暂存区生成 AI commit message。
- 支持手动编辑 commit message。
- 支持提交。
- 支持单仓库 pull。
- 支持单仓库 push。
- 支持 Pull All。
- 支持 Push All。
- 支持定时刷新仓库状态。
- 支持基础设置：AI Key、Base URL、Model、扫描间隔、Git 操作并发数。

### 3.2 MVP 不做功能

- 不做自动提交。
- 不做自动推送。
- 不做 discard / reset / clean 等破坏性操作。
- 不做 rebase、merge 冲突解决器。
- 不做复杂 Git 历史图谱。
- 不做代码审查。
- 不把未暂存代码发送给 AI。
- 不上传整个仓库代码。

---

## 4. 核心用户流程

### 4.1 添加仓库

1. 用户点击左侧 `+`。
2. 选择 `添加仓库`。
3. 弹出系统文件夹选择器。
4. 选择一个包含 `.git` 的目录。
5. 应用读取仓库信息。
6. 仓库出现在左侧列表。
7. 如果选择的目录不是 Git 仓库，显示错误：`该目录不是 Git 仓库`。

### 4.2 新建分类

1. 用户点击左侧 `+`。
2. 选择 `新建分类`。
3. 输入分类名称。
4. 分类出现在左侧。
5. 仓库可以移动到分类中。

### 4.3 查看仓库状态

1. 用户点击左侧仓库。
2. 右侧显示该仓库的头部信息、分支、远端状态、差异列表。
3. 应用读取：
   - 当前分支
   - upstream
   - staged changes
   - unstaged changes
   - untracked files
   - ahead / behind
   - conflict 状态

### 4.4 暂存代码

用户可以：

- 点击单个文件的 `Stage`。
- 选择多个文件后点击 `Stage Selected`。
- 点击 `Stage All` 暂存全部变更。
- 点击 `Unstage` 或 `Unstage All` 取消暂存。

所有暂存操作完成后，需要自动刷新当前仓库状态和差异列表。

### 4.5 AI 生成提交信息

1. 用户先暂存需要提交的文件。
2. 点击 `Generate AI Message`。
3. 应用读取暂存区 diff。
4. 本地做 diff 预处理和裁剪。
5. 调用 AI API。
6. 返回 3 个候选提交信息。
7. 用户点击某一条 `Use`。
8. 提交信息填入输入框。
9. 用户仍可手动修改。

重要规则：

- AI 只分析暂存区。
- 未暂存文件不发送给 AI。
- 二进制文件、图片、字体、锁文件、大型文件需要摘要化，不完整发送。
- 用户可以查看实际发送给 AI 的 Prompt。

### 4.6 提交

1. 用户确认 commit message。
2. 点击 `Commit`。
3. 执行 `git commit -m "message"`。
4. 成功后刷新状态。
5. 如果没有暂存内容，禁止提交。
6. 如果 message 为空，禁止提交。

### 4.7 单仓库 Pull

1. 用户点击当前仓库 `Pull`。
2. 如果有未提交改动，默认阻止 pull，并提示：`当前仓库有本地改动，请先提交或处理后再拉取`。
3. 如果工作区干净，执行 `git pull --ff-only`。
4. 成功后刷新状态。
5. 如果无法 fast-forward，提示用户去命令行或 IDE 处理。

### 4.8 单仓库 Push

1. 用户点击当前仓库 `Push`。
2. 如果当前分支没有 upstream，提示：`当前分支没有 upstream，暂不支持自动 push`。
3. 如果 ahead > 0，执行 `git push`。
4. 成功后刷新状态。
5. 如果认证失败或网络失败，显示错误。

### 4.9 Pull All

Pull All 用来解决多电脑开发时忘记同步的问题。

流程：

1. 用户点击左侧底部 `Pull All`。
2. 应用扫描所有仓库。
3. 对每个仓库判断：
   - 有未提交改动：跳过。
   - 有冲突：跳过。
   - 没有 upstream：跳过。
   - ahead + behind：跳过，提示分叉，需要人工处理。
   - behind > 0 且工作区干净：执行 `git pull --ff-only`。
   - behind = 0：标记为 already up to date。
4. 弹出结果抽屉，显示成功、跳过、失败、无需操作。

Pull All 必须是安全策略，不能自动 merge，不能自动 rebase。

### 4.10 Push All

Push All 用来把已经提交但未推送的代码推到远端。

流程：

1. 用户点击左侧底部 `Push All`。
2. 应用扫描所有仓库。
3. 对每个仓库判断：
   - 没有 upstream：跳过。
   - ahead = 0：标记为 no commits to push。
   - ahead > 0：执行 `git push`。
   - 有本地未提交改动时仍允许 push 已提交内容，但结果中要显示警告 `workspace has local changes`。
4. 弹出结果抽屉。

---

## 5. 仓库状态定义

### 5.1 RepoStatus

```ts
export type RepoStatusKind =
  | 'clean'
  | 'changed'
  | 'staged'
  | 'ahead'
  | 'behind'
  | 'diverged'
  | 'conflict'
  | 'checking'
  | 'error';

export interface RepoStatus {
  repoId: string;
  path: string;
  name: string;
  branch: string | null;
  upstream: string | null;
  remoteUrl?: string;
  stagedCount: number;
  unstagedCount: number;
  untrackedCount: number;
  addedCount: number;
  modifiedCount: number;
  deletedCount: number;
  renamedCount: number;
  conflictCount: number;
  ahead: number;
  behind: number;
  isClean: boolean;
  hasLocalChanges: boolean;
  statusKinds: RepoStatusKind[];
  lastScannedAt: number;
  error?: string;
}
```

### 5.2 ChangeItem

```ts
export type ChangeStatus = 'A' | 'M' | 'D' | 'R' | 'C' | 'U' | '?';
export type ChangeStage = 'staged' | 'unstaged' | 'untracked';

export interface ChangeItem {
  repoId: string;
  path: string;
  oldPath?: string;
  status: ChangeStatus;
  stage: ChangeStage;
  additions?: number;
  deletions?: number;
  sizeBytes?: number;
  isBinary?: boolean;
}
```

### 5.3 Repository

```ts
export interface RepositoryRecord {
  id: string;
  name: string;
  path: string;
  groupId?: string;
  order: number;
  createdAt: number;
  updatedAt: number;
}
```

### 5.4 RepositoryGroup

```ts
export interface RepositoryGroup {
  id: string;
  name: string;
  order: number;
  collapsed: boolean;
  createdAt: number;
  updatedAt: number;
}
```

---

## 6. Git 命令实现建议

所有 Git 操作在 Electron main process 中执行，renderer 不直接执行命令。

### 6.1 基础封装

实现 `GitService`：

```ts
class GitService {
  getStatus(repoPath: string): Promise<RepoStatus>;
  getChanges(repoPath: string): Promise<ChangeItem[]>;
  getFileDiff(repoPath: string, filePath: string, stage: 'staged' | 'unstaged'): Promise<string>;
  stageFile(repoPath: string, filePath: string): Promise<void>;
  unstageFile(repoPath: string, filePath: string): Promise<void>;
  stageAll(repoPath: string): Promise<void>;
  unstageAll(repoPath: string): Promise<void>;
  getStagedSmartDiff(repoPath: string): Promise<SmartDiffResult>;
  commit(repoPath: string, message: string): Promise<GitOperationResult>;
  pull(repoPath: string): Promise<GitOperationResult>;
  push(repoPath: string): Promise<GitOperationResult>;
  fetch(repoPath: string): Promise<GitOperationResult>;
}
```

### 6.2 推荐命令

读取状态：

```bash
git status --porcelain=v1 -b
```

读取暂存 diff：

```bash
git diff --cached --no-color
```

读取未暂存 diff：

```bash
git diff --no-color -- <file>
```

读取暂存文件状态：

```bash
git diff --cached --name-status --no-renames
```

读取未暂存文件状态：

```bash
git diff --name-status --no-renames
```

读取未跟踪文件：

```bash
git ls-files --others --exclude-standard
```

暂存文件：

```bash
git add -- <file>
```

取消暂存：

```bash
git restore --staged -- <file>
```

全部暂存：

```bash
git add -A
```

全部取消暂存：

```bash
git restore --staged .
```

提交：

```bash
git commit -m "message"
```

拉取：

```bash
git pull --ff-only
```

推送：

```bash
git push
```

### 6.3 ahead / behind 解析

通过 `git status --porcelain=v1 -b` 的第一行解析，例如：

```text
## main...origin/main [ahead 2, behind 1]
```

如果没有 upstream：

```text
## feature/demo
```

需要识别：

- branch
- upstream
- ahead
- behind

### 6.4 状态刷新策略

刷新分两类：

1. 轻量刷新：只执行 `git status --porcelain=v1 -b` 和本地 diff 列表。
2. 远端刷新：执行 `git fetch --prune --quiet` 后再读取 ahead / behind。

MVP 策略：

- 当前选中仓库：每次切换、暂存、提交、pull、push 后立即刷新。
- 所有仓库：默认每 60 秒后台扫描一次。
- 远端 fetch：默认每 5 分钟一次，避免太频繁。
- 并发数默认 3。
- 每个 Git 命令默认超时 60 秒。
- 忽略 `node_modules`、`.git` 之外的大量文件监听，只监听仓库根目录的 `.git/index` 和工作区变化事件，并做 debounce。

---

## 7. AI Commit 设计

AI Commit 模块参考已有 VS Code 插件方案，但要改造成桌面应用内部模块。

### 7.1 功能规则

- 只基于暂存区变更生成提交信息。
- 支持预处理预览。
- 支持查看最终发送给 AI 的 Prompt。
- 支持输出 3 种提交信息：
  - Emoji 风格
  - 简短中文风格
  - Conventional Commit 风格
- 支持用户配置 API Key、Base URL、Model、Prompt。
- 默认使用 OpenAI-compatible Chat Completions API。
- 默认请求路径：`{baseUrl}/chat/completions`。

### 7.2 AI 配置

```ts
export interface AiCommitConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  prompt: string;
  maxDiffChars: number;
  temperature: number;
}
```

默认值：

```ts
const defaultAiCommitConfig: AiCommitConfig = {
  apiKey: '',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-chat',
  prompt: DEFAULT_COMMIT_PROMPT,
  maxDiffChars: 200000,
  temperature: 0.2,
};
```

API Key 存储：

- MVP 可以存本地配置文件，但必须明确提示仅本机使用。
- 推荐使用 Electron `safeStorage` 或系统 Keychain。
- 不要把 API Key 写进日志。

### 7.3 Smart Diff 预处理

实现 `SmartDiffService`：

```ts
interface SmartDiffResult {
  diffText: string;
  files: SmartDiffFileSummary[];
  totalFiles: number;
  totalAdditions?: number;
  totalDeletions?: number;
  truncated: boolean;
  mode: 'full' | 'partial' | 'stat';
}

interface SmartDiffFileSummary {
  path: string;
  status: ChangeStatus;
  additions?: number;
  deletions?: number;
  chars: number;
  estimatedTokens: number;
  note?: string;
}
```

处理规则：

1. 删除文件：只输出 `[DELETED] path`。
2. 锁文件：`package-lock.json`、`yarn.lock`、`pnpm-lock.yaml` 只输出摘要。
3. 二进制 / 媒体文件：图片、字体、音视频、压缩包只输出 `[BINARY/ASSET] path`。
4. 生成文件：`.min.js`、`.min.css`、`.map` 只输出摘要。
5. 新增文件超过 50 行：保留前 25 行和后 25 行。
6. 修改文件超过 1000 行：保留前 800 行和后 50 行。
7. 总文件数超过 100：退化到 `git diff --cached --stat`。
8. 总字符数超过 `maxDiffChars`：退化到 `git diff --cached --stat`。

### 7.4 Prompt

默认 Prompt：

```text
你是一个资深前端/全栈工程师，擅长根据 Git 暂存区 diff 生成准确、简洁、可维护的提交信息。

要求：
1. 只根据用户提供的 staged diff 生成提交信息。
2. 不要猜测 diff 之外的内容。
3. 使用简体中文为主。
4. 根据路径推断 scope，例如 git、ui、api、home、base-info、test、build。
5. 根据变更内容推断 type，例如 feat、fix、refactor、test、style、chore、docs、build。
6. 输出 3 个候选：Emoji、StandardShort、Conventional。
7. 必须返回严格 JSON 数组，不要输出解释文本。

返回格式：
[
  {
    "type": "Emoji",
    "message": "✨ feat(scope): 提交信息"
  },
  {
    "type": "StandardShort",
    "message": "scope: 简短中文提交信息"
  },
  {
    "type": "Conventional",
    "message": "feat(scope): concise English or Chinese message"
  }
]

项目信息：
{{PROJECT_META}}

变更摘要：
{{CHANGE_SUMMARY}}
```

### 7.5 响应解析

实现 `AiCommitService.parseResponse()`：

1. 去除 ```json 代码块。
2. 尝试严格 JSON.parse。
3. 如果失败，正则提取 JSON 数组。
4. 如果仍失败，正则提取单个对象。
5. 校验每项必须包含 `type` 和 `message`。
6. 固定排序：Emoji → StandardShort → Conventional → 其他。

### 7.6 生成结果 UI

返回结果后，UI 展示三张卡片：

- 类型 label
- message
- `Use`
- `Copy`

用户点击 `Use` 后，把 message 写入 commit 输入框。

---

## 8. 数据存储

MVP 可以使用本地 JSON 文件，后续可迁移 SQLite。

### 8.1 配置位置

建议：

```text
用户数据目录/VibeGitDesk/config.json
用户数据目录/VibeGitDesk/repositories.json
用户数据目录/VibeGitDesk/operation-log.jsonl
```

### 8.2 config.json

```json
{
  "scanIntervalSeconds": 60,
  "remoteFetchIntervalSeconds": 300,
  "gitCommandTimeoutSeconds": 60,
  "maxConcurrentGitJobs": 3,
  "theme": "dark",
  "aiCommit": {
    "baseUrl": "https://api.deepseek.com",
    "model": "deepseek-chat",
    "maxDiffChars": 200000,
    "temperature": 0.2
  }
}
```

### 8.3 repositories.json

```json
{
  "groups": [
    { "id": "work", "name": "工作项目", "order": 1, "collapsed": false }
  ],
  "repositories": [
    {
      "id": "repo_001",
      "name": "credit-monorepo",
      "path": "E:/github/credit-monorepo",
      "groupId": "work",
      "order": 1,
      "createdAt": 1710000000000,
      "updatedAt": 1710000000000
    }
  ]
}
```

---

## 9. 前端页面结构

### 9.1 组件拆分

```text
src/renderer/
  App.vue
  layouts/
    MainLayout.vue
  components/
    sidebar/
      RepoSidebar.vue
      RepoGroup.vue
      RepoItem.vue
      GlobalGitActions.vue
    workspace/
      RepoWorkspace.vue
      RepoHeader.vue
      RepoToolbar.vue
      ChangeList.vue
      ChangeRow.vue
      DiffPreview.vue
      AiCommitPanel.vue
      CommitBox.vue
    drawers/
      OperationResultDrawer.vue
      SettingsDrawer.vue
    common/
      StatusBadge.vue
      IconButton.vue
      EmptyState.vue
      ErrorBanner.vue
```

### 9.2 状态管理

使用 Pinia：

```text
stores/
  repoStore.ts
  gitStatusStore.ts
  changeStore.ts
  aiCommitStore.ts
  operationStore.ts
  settingsStore.ts
```

### 9.3 IPC 边界

renderer 只能通过 IPC 调用 main process。

```ts
window.gitApi = {
  addRepository(path),
  listRepositories(),
  getStatus(repoId),
  getChanges(repoId),
  getFileDiff(repoId, filePath, stage),
  stageFile(repoId, filePath),
  unstageFile(repoId, filePath),
  stageAll(repoId),
  unstageAll(repoId),
  commit(repoId, message),
  pull(repoId),
  push(repoId),
  pullAll(),
  pushAll(),
};

window.aiApi = {
  generateCommitMessage(repoId),
  previewSmartDiff(repoId),
  getLastPrompt(repoId),
};
```

---

## 10. 后端模块结构

```text
src/main/
  main.ts
  preload.ts
  ipc/
    gitHandlers.ts
    repoHandlers.ts
    aiHandlers.ts
    settingsHandlers.ts
  services/
    GitService.ts
    RepoRegistryService.ts
    RepoScannerService.ts
    SmartDiffService.ts
    AiCommitService.ts
    OperationQueue.ts
    SettingsService.ts
    SecretService.ts
  utils/
    execGit.ts
    parseGitStatus.ts
    pathUtils.ts
    logger.ts
```

### 10.1 OperationQueue

所有批量操作必须进入队列，避免同时对太多仓库执行 Git 命令。

```ts
class OperationQueue {
  constructor(maxConcurrency: number);
  add<T>(task: () => Promise<T>): Promise<T>;
  cancelPending(): void;
}
```

### 10.2 RepoScannerService

负责定时扫描所有仓库。

能力：

- scanOne(repoId)
- scanAll()
- startAutoScan(intervalSeconds)
- stopAutoScan()
- emit status changed event

注意：

- 正在执行 commit/pull/push 的仓库不要重复扫描。
- 扫描失败不能导致整个应用崩溃。
- 每个仓库独立显示错误。

---

## 11. 操作结果模型

```ts
export type GitOperationStatus = 'success' | 'skipped' | 'failed' | 'noop';

export interface GitOperationResult {
  repoId: string;
  repoName: string;
  operation: 'pull' | 'push' | 'commit' | 'stage' | 'unstage' | 'scan';
  status: GitOperationStatus;
  message: string;
  stdout?: string;
  stderr?: string;
  startedAt: number;
  endedAt: number;
}
```

Pull All / Push All 返回：

```ts
export interface BatchGitOperationResult {
  operation: 'pullAll' | 'pushAll';
  total: number;
  success: number;
  skipped: number;
  failed: number;
  noop: number;
  items: GitOperationResult[];
}
```

---

## 12. 安全与可靠性要求

### 12.1 Git 操作安全

- Pull 默认必须使用 `--ff-only`。
- Pull All 遇到本地未提交改动必须跳过。
- 不自动 merge。
- 不自动 rebase。
- 不自动 stash。
- 不自动 discard。
- 所有 Git 命令都需要超时。
- 所有路径参数都必须使用 child_process 参数数组，不要拼接 shell 字符串。

### 12.2 AI 安全

- 只发送 staged diff。
- API Key 不写入日志。
- Prompt 预览不能显示 API Key。
- 大文件、二进制、锁文件要摘要化。
- 用户可关闭 AI 功能。

### 12.3 UI 反馈

- 所有耗时操作显示 loading。
- 所有失败操作显示错误原因。
- 批量任务必须显示逐仓库结果。
- 当前仓库状态不能因为某一个仓库扫描失败而消失。

---

## 13. 关键验收标准

### 13.1 多仓库管理

- 可以添加至少 20 个仓库。
- 可以创建分类并把仓库放入分类。
- 左侧能看到每个仓库的 clean / changed / ahead / behind / conflict 状态。
- 状态定时刷新，并能手动刷新。

### 13.2 当前仓库工作流

- 能看到未暂存和已暂存文件。
- 能暂存单个文件和全部文件。
- 能取消暂存单个文件和全部文件。
- 能查看文件 diff。
- 有暂存内容时能生成 AI 提交信息。
- 能编辑提交信息并 commit。
- commit 成功后状态刷新。
- ahead 后能 push。

### 13.3 批量同步

- Pull All 会跳过有本地改动的仓库。
- Pull All 只对 behind 且干净的仓库执行 `git pull --ff-only`。
- Push All 只推送 ahead 的仓库。
- 批量操作结果中能看到 success / skipped / failed / noop。

### 13.4 AI Commit

- 没有暂存内容时不能生成。
- 生成时只读取暂存 diff。
- 二进制和大文件不会完整发送。
- 正常返回 3 条候选提交信息。
- 点击 Use 能填入提交输入框。
- 可以查看最终 Prompt。

---

## 14. 推荐开发顺序

### Phase 1：项目骨架

- 初始化 Electron + Vue 3 + TypeScript + Vite。
- 完成 main / preload / renderer IPC。
- 完成基础布局：左侧仓库栏 + 右侧工作区。

完成标准：应用能启动，能展示静态 UI。

### Phase 2：仓库注册与状态扫描

- 添加仓库。
- 保存仓库列表。
- 实现 `git status` 解析。
- 左侧显示仓库状态。
- 实现定时扫描。

完成标准：多个仓库状态可以正确显示。

### Phase 3：差异列表与暂存

- 读取 changes。
- 显示 unstaged / staged。
- 支持 stage / unstage / stage all / unstage all。
- 支持 diff 预览。

完成标准：当前仓库可以完成基础暂存操作。

### Phase 4：提交、Pull、Push

- 实现 commit。
- 实现 pull --ff-only。
- 实现 push。
- 实现操作结果和错误提示。

完成标准：单仓库完整 Git 流程可用。

### Phase 5：AI Commit

- 实现 SmartDiffService。
- 实现 AiCommitService。
- 设置页支持 API Key / Base URL / Model。
- UI 展示 3 个提交候选。
- 支持 Prompt 预览。

完成标准：暂存代码后能生成并使用提交信息。

### Phase 6：Pull All / Push All

- 实现 OperationQueue。
- 实现 Pull All 安全跳过策略。
- 实现 Push All。
- 实现结果抽屉。

完成标准：批量同步功能可用，且每个仓库都有结果。

---

## 15. 给代码 AI 的实现约束

请严格遵守：

1. 不要实现任何破坏性 Git 操作。
2. 不要自动提交、自动推送、自动拉取。
3. Git 命令不能通过字符串拼接 shell 执行，要使用参数数组。
4. Renderer 不能直接执行 Git 命令。
5. AI 只读取暂存区 diff。
6. 所有 API Key 不允许写入日志。
7. 每个功能都要有 loading、success、error 状态。
8. 批量操作必须有并发限制和逐仓库结果。
9. UI 先保证可用性，不要过度动画。
10. 每个阶段完成后停止，输出完成内容、未完成内容和下一步建议，不要无限循环。

---

## 16. 一句话开发指令

可以把下面这句给代码 AI：

```text
请阅读当前目录下的《需求文档：多仓库 Git 管理工具》，按 Phase 1 到 Phase 6 分阶段实现一个 Electron + Vue 3 + TypeScript 的桌面端多仓库 Git 管理工具；每个 Phase 完成后停止并报告完成项、文件变更、已知问题和下一步，不要跳过安全约束，不要实现破坏性 Git 操作。
```
