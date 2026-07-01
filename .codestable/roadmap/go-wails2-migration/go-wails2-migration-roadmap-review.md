---
doc_type: roadmap-review
roadmap: go-wails2-migration
status: passed
reviewed: 2026-07-01
round: 1
---

# go-wails2-migration roadmap 审查报告

## 1. Scope And Inputs

- Roadmap: `.codestable/roadmap/go-wails2-migration/go-wails2-migration-roadmap.md`
- Items: `.codestable/roadmap/go-wails2-migration/go-wails2-migration-items.yaml`
- Related docs: `.codestable/requirements/VISION.md`, `.codestable/attention.md`
- Code facts checked: `src/app/api.ts`, `scripts/vite-git-api.mjs`, `scripts/sync-real-data.mjs`, `scripts/local-system.mjs`, `src/app/types.ts`

### Independent Review

- Status: local-only
- Detection: local-only
- Provider / agent: none
- Raw output: none
- Merge policy: 未启用独立 reviewer；本轮为本地 gate 审查
- Gate effect: none

## 2. Roadmap Summary

- Goal completion signal: 以 Wails2 宿主替代 Node 本地 API，并保持现有 UI 工作流与核心数据契约稳定
- Module split: Wails 宿主层、Git 应用服务层、系统集成层、AI Commit 服务层、前端适配层
- Interface contracts: 已定义统一 Wails 绑定入口、`AppSnapshot` 共享结构、Git 命令执行契约、系统动作契约与 AI Commit 契约
- Items: 6 条，`wails-shell-bootstrap` 为 minimal loop，风险集中在 DTO 稳定性、Git 错误语义与 Node 暗依赖清理
- Dependency shape: DAG，`wails-shell-bootstrap` → `git-operation-parity` / `desktop-bridge-parity` → `ai-commit-parity` → `frontend-transport-cutover` → `node-removal-and-regression`

## 3. Findings

### blocking

none

### important

none

### nit

- [ ] RMR-001 `.codestable/roadmap/go-wails2-migration/go-wails2-migration-roadmap.md#7` 观察项中提到现有 feature 可能依赖旧 `/api/*` 假设，后续进入具体 feature design 时应逐条引用受影响 feature，避免只停留在提醒层。

### suggestion

- [ ] RMR-002 可在 `wails-shell-bootstrap` 的 feature design 中补一份“前端默认设置与 Wails 绑定 smoke list”，让首条 acceptance 更容易形成固定证据。

### learning

- 当前项目把桌面宿主能力分散在 `vite-git-api.mjs`、`sync-real-data.mjs`、`local-system.mjs` 三层，roadmap 先按宿主、业务、系统桥接拆模块是合理的；若直接按文件迁移，后续接口会继续耦合在一起。

### praise

- 先用 `wails-shell-bootstrap` 冻结快照契约，再迁移 Git / AI / 系统动作，能有效降低前后端同时漂移的风险。
- 最后一条单独处理 Node 运行时移除与回归扫尾，避免“功能迁完但打包失败”的收口缺口。

## 4. User Review Focus

- 用户需要重点拍板：第一阶段是否接受“仅 Windows 等价、不同时做跨平台”的边界。
- 后续 feature-design 需要重点复核：Wails 绑定命名、错误语义保持方式、现有 feature 是否依赖 `/api/*`。
- 不能靠 roadmap review 完全确认的点：本机 Wails / Go 工具链准备情况、AI commit 在 Go 中对现有 Node 实现的细节对齐程度。

## 5. Evidence Confidence Ledger

| Check | Verdict | Evidence Class | Basis | Follow-up |
|---|---|---|---|---|
| Granularity Gate | pass | E | roadmap 第 2 节明确说明跨宿主、业务、前端、构建的多阶段迁移范围 | none |
| Goal Coverage Matrix | pass | E | roadmap 第 5 节给出每个核心完成信号的 item、验证入口与证据类型 | acceptance 时逐条兑现 |
| DAG and minimal loop | pass | E | items.yaml 依赖无环，且仅 `wails-shell-bootstrap` 标记 `minimal_loop: true` | none |
| Interface contract usability | pass | C | roadmap 第 4 节契约与 `src/app/api.ts`、`src/app/types.ts`、Node 脚本事实对应 | feature design 时复核命名与默认值 |

Summary: E=3, C=1, H=0, H-only core checks=none。

## 6. Residual Risk

- 当前仓库缺少自动化测试与 typecheck 入口，迁移验证主要依赖构建命令与手工烟测；后续 feature acceptance 必须把命令输出和手工证据写实。
- `VISION.md` 仍声明 Electron + Vue 3 推荐路线，若 roadmap 开始实施但需求层不更新，后续 agent 可能继续被旧技术路线误导。

## 7. Verdict

- Status: passed
- Next: 交给用户 review；若用户要求修改范围、接口或条目依赖，回 `cs-roadmap` 修订后重跑 `cs-roadmap-review`
