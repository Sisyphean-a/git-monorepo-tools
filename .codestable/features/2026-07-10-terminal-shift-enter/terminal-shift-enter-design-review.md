---
doc_type: feature-design-review
feature: 2026-07-10-terminal-shift-enter
status: passed
reviewed: 2026-07-10
round: 3
---

# terminal-shift-enter feature design 审查报告

## 1. Scope And Inputs

- Design: `.codestable/features/2026-07-10-terminal-shift-enter/terminal-shift-enter-design.md`
- Checklist: `.codestable/features/2026-07-10-terminal-shift-enter/terminal-shift-enter-checklist.yaml`
- Intent / brainstorm: none
- Roadmap: none
- Related docs: 无相关 requirements、ADR 或 compound 记录。
- Code facts checked: 终端快捷键、前端输入队列、Windows ConPTY host、PowerShell 启动脚本、本机 PowerShell 的 PSReadLine 键位及 PSReadLine 源码。

### Independent Review

- Status: completed
- Detection: native-agent
- Provider / agent: Codex Task agent
- Raw output: 三轮独立审查；前两轮提出 VT 输入前置、显式失败、顺序证据和回退 shell 验收缺口，第三轮确认已解决。
- Merge policy: 所有 finding 均已通过设计、现有代码和本机 PSReadLine 事实核验并合入修订。
- Gate effect: none

## 2. Design Summary

- Goal: Windows 终端的 Shift+Enter 调用 PSReadLine AddLine，不执行当前命令。
- Key contracts: `\x1b[1;8S` 只在 Windows Shift+Enter 触发；启动脚本先开启 `PSREADLINE_VTINPUT=1`，再以显式失败加载 PSReadLine 并绑定 AddLine；代理序列通过现有输入队列发送。
- Steps: 4 步，覆盖动作契约、PowerShell 编排、输入接通和桌面验收。
- Checks: 7 项，覆盖语义、VT 输入、队列顺序、范围与验收。
- Baseline / validation: 定向 TypeScript、前端测试、Go 测试、Wails 构建和两种 shell 的 Windows 实机验证。

## 3. Findings

### blocking

none

### important

none

### nit

none

### suggestion

- 验收记录中保留临时 PATH 的实际值或启动方式，方便复现 Windows PowerShell 回退路径。

### learning

- 代理按键协议依赖 PSReadLine 的 VT 输入模式；环境变量设置顺序属于行为契约。

### praise

- 设计没有伪造换行，复用 PowerShell 原生 AddLine、既有输入队列和可注入 shell 查找点，范围保持局部。

## 4. User Review Focus

- 用户需要重点拍板：仅 Windows 的 pwsh/Windows PowerShell 会话启用此行为，并将 PSReadLine 设为显式启动依赖。
- implement 需要重点遵守：代理序列必须在 PSReadLine 加载前启用 VT 输入，并先于后续 Enter 写入队列。
- code review / QA / acceptance 需要重点复核：普通 Enter 和既有快捷键不回归，以及 pwsh 优先、Windows PowerShell 回退均可用。

## 5. Evidence Confidence Ledger

| Check | Verdict | Evidence Class | Basis | Follow-up |
|---|---|---|---|---|
| Acceptance Coverage Matrix | pass | E | design 第 3 节与 checklist S1-S4 | Windows 实机 |
| DoD Contract | pass | E | design 第 3 节与 checklist dod.commands | none |
| Steps and checks traceability | pass | E | checklist 的每项均可回溯至 design 第 2/3 节 | none |
| Roadmap contract compliance | n/a | E | feature 不来自 roadmap | none |
| Module interface design | pass | C | 快捷键、输入队列和启动脚本的既有边界 | code review |
| Validation and artifacts | pass | E | 四条验证命令和验收记录要求 | Windows 实机 |

Summary: E=4, C=1, H=0, H-only core checks=none。

## 6. Residual Risk

- PSReadLine 的 VT 输入支持仍依赖目标机的模块版本；验收必须记录 pwsh 与 Windows PowerShell 的版本、PSReadLine 版本、VT 输入值和实际 AddLine 结果。

## 7. Verdict

- Status: passed
- Next: 交给用户整体 review。
