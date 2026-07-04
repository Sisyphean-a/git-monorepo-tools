---
doc_type: goal
goal: terminal-stream-performance
status: blocked
---

# 终端高频输出性能优化

## Objective

优化仓库终端 Tab 在高频海量输出场景下的性能，重点处理 `codex`、`claude` 这类持续刷屏 CLI，让终端在长时间高速输出时仍保持交互流畅、资源占用低且行为稳定。

## Starting Point

当前终端输出链路是“后端读到一块就发一块事件，前端收到一条就立刻写一条 xterm”。这种逐事件直通模式在普通命令下可用，但面对 agent 类 CLI 的持续高频输出时，容易把性能消耗堆到事件频率和渲染次数上。

## Acceptance Criteria

- 在真实高频 CLI 持续输出场景下，终端输入、滚动和切换 Tab 仍保持稳定，不出现明显卡顿或失去响应。
- 终端输出链路具备明确的批量 / 裁剪 / 节流策略，资源占用明显低于逐事件立刻渲染的现状。
- 提供一个可复现的本地压测或基准，能证明高频输出下的性能改善方向和稳定性。
- 完成代码验证与独立功能验收。

## Non-Goals

- 不扩展到右侧命令输出面板或其他流式文本区域。
- 不改变终端的基本交互语义，例如 Ctrl+C、方向键、彩色输出、resize。
- 不新增终端设置页或复杂性能调参 UI。

## Decisions And Assumptions

- owner 已明确选择：交互优先，而不是历史优先。
- 优化范围只限终端 Tab，不碰其他输出 UI。
- 完成证据采用“双证据”：真实高频 CLI 场景 + 可复现本地压测。
- 历史保留可以为性能让路，只要不破坏终端基本可用性。

## Current State

后端输出批量合并、前端逐帧分批写入、共享事件总线、隐藏态暂停刷写与有界尾部保留都已完成，本地验证全部通过。当前真实剩余项只剩 CodeStable 终端 gate：独立 Task agent review 与功能验收授权已连续卡住三轮 iteration，因此 goal 现按约定转为 `blocked`，等待 owner 决定。

## Next Action

等待 owner 决定是否授权 Task agent 执行独立 review 与功能验收；获授权后恢复终端 gate 并准备 goal 收尾。
