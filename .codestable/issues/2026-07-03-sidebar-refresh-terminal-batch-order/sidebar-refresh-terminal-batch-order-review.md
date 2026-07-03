---
doc_type: issue-review
issue: 2026-07-03-sidebar-refresh-terminal-batch-order
status: passed
reviewer: ocr
reviewed: 2026-07-03
round: 1
---

# sidebar-refresh-terminal-batch-order 代码审查报告

## 1. Scope And Inputs

- Design: none（issue 快速通道，按用户 2026-07-03 对话确认范围）
- Checklist: none
- Evidence pack: none
- Gate results: none
- DoD results: none
- Implementation evidence: 用户 2026-07-03 对话 + `sidebar-refresh-terminal-batch-order-fix-note.md`
- Diff basis: `git status --short` + 当前工作区 diff
- Baseline dirty files: none

### Independent Review

- Detection: 无 Paseo / 原生 Task agent；`ocr` CLI 可用且 `ocr llm test` 通过
- 环节 A 独立隔离 Task agent: local-only + not-available
- 环节 B OCR CLI: completed
- OCR severity mapping: High→blocking/important，Medium→nit/suggestion，Low→discarded
- Merge policy: 先跑 OCR，再由主 agent 逐条本地复核；其中 1 条代码味道已吸收修正，性能建议未升级为问题，测试覆盖建议已补最小单测
- Gate effect: 当前环境只能走 `ocr` 降级路径；commit gate 需 self-review fallback override

## 2. Diff Summary

- 新增：`desktop_process_other.go`、`desktop_process_windows.go`、`desktop_process_windows_test.go`、`desktop_test.go`、`src/app/pull-results.ts`、`src/app/pull-results.test.ts`、本 issue 文档目录
- 修改：`desktop.go`、`package.json`、`src/app/App.tsx`、`src/app/components/pull-all-drawer.tsx`、`src/app/components/sidebar.tsx`、`tsconfig.snapshot-tests.json`
- 删除：none
- 未跟踪 / staged：未跟踪文件均为本轮新增；无 staged 文件
- 风险热点：桌面终端拉起路径、前端手动刷新状态、批量结果展示顺序

## 3. Adversarial Pass

- 假设的生产 bug：终端启动路径虽然改成新控制台，但桌面态下仍可能因宿主差异出现“窗口打开即退出”。
- 主动攻击过的反例：重复点击扫描按钮、批量结果只有 1 个仓库有动作时是否被埋、同类结果排序是否稳定、Windows 路径是否仍依赖额外 `Set-Location` 命令。
- 结果：未发现阻塞性问题；终端体感验证仍保留到 residual risk。

## 4. Findings

### blocking

- none

### important

- none

### nit

- none

### suggestion

- none

### learning

- 批量结果排序提成纯函数后，列表展示和复制报告共用同一套顺序，后面不容易再出现“UI 排序和导出排序不一致”。

### praise

- Windows 终端修复没有继续堆 PowerShell 字符串拼接，而是直接改成目标目录启动交互式 shell，并补了最小 Go 单测，方向是对的。

## 5. Test And QA Focus

- QA 必须重点复核：侧边栏“扫描”按钮点击后是否立刻出现 spinner；桌面窗口里点击右上角“终端”后窗口是否稳定留存；批量 Pull/Push 结果里“已拉取/已推送/失败/跳过”是否确实顶到前面。
- Evidence pack residual risks / gate warnings：本轮无 evidence pack；review 路径为 `ocr` 降级，不是假装双环节已完成。
- 建议新增或加强的测试：none
- 不能靠 review 完全确认的点：Wails 桌面运行态下的终端窗口真实交互表现

## 6. Residual Risk

- 终端自动关闭问题本轮只做到了代码路径和单测级验证，最终仍要靠一次真实桌面点击确认。
- 本轮没有 subagent 独立审查，只完成了 OCR + 本地复核；若后续把 review gate 作为硬规则，需补可用的独立 reviewer 能力。

## 7. Verdict

- Status: passed
- Next: issue 修复已可进入提交收尾；若坚持严格 gate，需要带 `CODESTABLE_ALLOW_SELF_REVIEW_FALLBACK=1` 重跑 commit gate
