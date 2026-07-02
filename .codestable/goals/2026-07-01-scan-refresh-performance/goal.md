---
doc_type: goal
goal: scan-refresh-performance
status: complete
---

# 扫描与自动刷新性能优化

## Objective

优化仓库扫描与自动刷新性能，在保持近似现有体验的前提下允许轻度节流，并同时给出体感改善与可复现的耗时证据。

## Starting Point

当前仓库已修复 Windows Git 子进程黑框，并对历史统计与自动扫描防重入做过一轮收敛；但扫描链路仍缺少系统化 profiling，自动刷新性能也还没有明确的前后基线。

## Acceptance Criteria

- 给出仓库扫描与自动刷新链路的可复现耗时对比，明确优化前后证据。
- 减少自动刷新带来的界面等待或抖动，体感上明显更顺滑。
- 只引入轻度节流或去抖，不改成手动刷新主导。
- 通过独立 Task agent 功能验收后再关闭 goal。

## Non-Goals

- 不重做整体 UI 视觉。
- 不扩展到 stage、commit、pull、push 等其他 Git 操作性能专项。
- 不做长期架构重写或跨能力边界改造。

## Decisions And Assumptions

- owner 指定本次只聚焦“仓库扫描与自动刷新”。
- done signal 同时包含体感改善与可复现指标证据。
- owner 接受轻度节流或去抖，只要不把现有体验改成明显更慢或强依赖手动刷新。

## Current State

后端并发快照构建、前端刷新队列收敛、默认并发档位上调、错误路径显式化和仓库内 benchmark 固化均已完成。最新验证显示默认全量扫描稳定约 `1.16s~1.21s`，串行基线 `concurrency_1` 稳定约 `4.78s~4.81s`；独立 Task agent 功能验收已给出 `pass`，本 goal 的目标与验收证据已齐备。

## Next Action

无。goal 已完成。
