# 功能验收报告

## Reviewer

独立 Task agent（explorer 子代理）

## Scope

当前 goal 的 4 项验收标准：

- 真实 diff 预览。
- 空按钮接真实本地能力。
- 设置持久化并驱动真实行为。
- 自动扫描按设置生效。

## Acceptance Checks

- 通过：真实 diff 预览已接到 `fetchRepoDiff -> /api/repos/:id/diff -> buildRepoDiff/buildFilePreviewLines`，运行证据显示首仓首文件返回 48 行真实 diff，`view=unstaged`。
- 通过：文件夹、终端、日志、重试、加号新增入口已接到真实本地能力，分别走 `invokeLocalRepoAction`、`fetchRepoLog`、`mutateRepo`、`pickFolder` 与本地 Vite API。
- 通过：设置已通过 `src/app/settings.ts` 持久化到 `localStorage`，并驱动扫描目录、自动扫描间隔、pull/push 策略，以及 AI 提交的 API Key、Base URL、模型、提示词、候选数量、Diff 截断、stagedOnly 等真实行为。
- 通过：自动扫描已由 `App.tsx` 中的定时 `useEffect` 按设置生效，侧栏开关与文案同步真实设置。

## Functional Evidence

- `npm run build`：通过。
- 本地 `5700` 接口证据：
  - `/api/snapshot` 返回 16 个真实仓库。
  - 首仓首文件 `/api/repos/:id/diff` 返回 48 行真实 diff，`view=unstaged`。
  - `/api/repos/:id/log` 返回真实日志，内容长度 7634。
- AI 提交真实行为链路：
  - `Workspace -> generateCommitCandidates -> /api/repos/:id/generate-commit -> generateAiCommitCandidates -> chat/completions` 已接通。
  - 生成时会真实使用设置中的 `apiKey`、`baseUrl`、`model`、`promptTemplate`、`maxDiffChars`、`generateThree`、`stagedOnly`。
  - 本地假 AI 服务验证：使用 `baseUrl=http://127.0.0.1:5811`、`model=mock-model`、`stagedOnly=false` 直连 `/api/repos/git-monorepo-tools-5b123e/generate-commit`，成功返回候选 `feat(mock-1): 验证 AI 设置生效`，说明设置已真正参与生成链路。

## Verdict

通过

## Residual Risks

- 无

## Follow-up

- 若 verdict 为通过，则提交并推送当前版本。
