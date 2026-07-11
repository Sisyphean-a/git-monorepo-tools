# terminal-shift-enter Goal Plan

- Feature: `.codestable/features/2026-07-10-terminal-shift-enter`
- Design: `terminal-shift-enter-design.md`
- Checklist: `terminal-shift-enter-checklist.yaml`
- Design review: `terminal-shift-enter-design-review.md`（passed）
- 用户确认：2026-07-10，用户明确回复“确认”。

## 执行约束

- 代码行为按 RED → GREEN → VERIFY 推进；无法先写 RED 的步骤必须记录 TDD exception 和替代证据。
- 必须保留 Windows 专用范围，不改变非 Windows 快捷键，不通过裸换行或反引号模拟 AddLine。
- 必须在加载 PSReadLine 前设置 `PSREADLINE_VTINPUT=1`，并以显式失败加载 PSReadLine。
- 代理序列和后续 Enter 必须走同一会话输入队列，顺序可测试。

## 必跑验证

1. `npx tsc -p tsconfig.snapshot-tests.json --noEmit`
2. `npm run test:snapshot-coordinator`
3. `go test ./...`
4. `npm run wails:build`

## 核心验收路径

1. Windows pwsh：Shift+Enter 进入下一编辑行，不执行；Enter 执行完整多行输入。
2. Windows PowerShell 回退：临时 PATH 隐藏 pwsh 后重复上述验证。
3. Ctrl+C、Ctrl+V、右键粘贴和非 Windows 快捷键不回归。

## Gate 与交接

- 实现后必须完成独立代码审查、QA 和 acceptance。
- 只有代码审查、QA、acceptance 都通过，且两种 PowerShell 的实机结果均已记录时，才能完成。
- 需要修改已批准设计、核心验证三次仍失败、独立审查不可用或缺少实机环境时写入 handoff 状态并停止。
