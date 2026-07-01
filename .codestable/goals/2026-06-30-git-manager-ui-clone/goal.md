---
doc_type: goal
goal: git-manager-ui-clone
status: active
---

# Git Manager UI Clone

## Objective

完成当前项目的 UI 复刻，使其与 `E:\其他\figma-ui` 的样式和交互一致，并使用真实本地 Git 数据而不是 mock 数据。

## Starting Point

当前仓库已经补成了可运行前端，但最初实现错误地沿用了参考项目的 mock 数据，和 owner 明确要求相冲突。

## Acceptance Criteria

- 应用可启动并展示与参考 UI 一致的主界面。
- 左侧仓库栏、右侧工作区、Pull All 抽屉、Settings 弹窗等核心界面保持参考 UI 的结构与视觉层级。
- 仓库列表、差异列表、提交历史、Pull All 结果等展示真实本地 Git 数据，而不是参考项目里的 mock 常量。
- 当前阶段产物已提交并推送到远端。

## Non-Goals

- 不改造参考项目本身。

## Decisions And Assumptions

- 以当前仓库为实现目标，优先复刻参考 UI 的结构、层级和交互。
- owner 已明确否决 mock 数据，后续展示数据必须来自真实本地 Git 仓库。
- 当前阶段先把界面从 mock 常量切到真实快照，再继续补真实 Git 操作链。

## Current State

当前仓库已经能构建，并已改为扫描本机 Git 仓库生成真实数据快照；但 stage/unstage/commit/pull/push 仍是前端本地交互，尚未接真实操作通道。

## Next Action

补齐真实 Git 操作通道（stage/unstage/commit/pull/push/refresh），消除仍停留在前端本地状态的交互。
