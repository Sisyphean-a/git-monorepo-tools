# Goal Protocol

1. 读取 design、checklist、goal-plan 和 goal-state，按仓库事实恢复进度。
2. 在 implementation 阶段完成 checklist steps；行为代码默认执行 RED → GREEN → VERIFY，例外写明 TDD exception 和替代证据。
3. 运行实现门禁并生成实现证据。
4. 进入独立代码审查；有 blocking 则窄修复并重新审查。
5. 审查通过后进入 QA；QA 失败则修复并重新审查和 QA。
6. QA 通过后进入 acceptance，更新 checklist checks 和验收报告。
7. 仅当两种支持的 PowerShell 实机验证完成、review/QA/acceptance 都通过时，写入 `stage: complete`、`status: passed` 并输出 `CS_FEATURE_GOAL_COMPLETE`。

## Goal 模式

本 goal 接管阶段间的普通确认点；每个阶段通过时写入报告、状态和证据。只有以下情况交接：需要修改已批准设计或范围、独立审查不可用、同一失败项三轮未解决、缺少判定核心行为所需的环境，或用户暂停/改方向。

交接前必须先把 `goal-state.yaml` 写成 `stage: handoff`、`status: blocked` 并填入原因和下一步。
