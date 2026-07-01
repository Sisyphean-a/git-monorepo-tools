---
doc_type: goal
goal: git-manager-ui-clone
status: active
---

# Git Manager UI Clone

## Objective

完成当前项目的 UI 复刻，并补齐剩余真实交互：真实 diff 预览、空按钮接本地能力、设置持久化和自动扫描。

## Starting Point

当前应用已切到真实本地 Git 数据，并已具备 stage/unstage/commit/pull/push 本地 API；但 diff 预览仍吃静态快照，多个按钮仍未接真实能力，设置只存在于前端内存，自动扫描也未真正生效。

## Acceptance Criteria

- Diff 预览随当前选中仓库和文件展示真实内容，而不是静态 `data.ts` 常量。
- 文件夹、终端、日志、重试、加号等现有操作按钮接到可用的本地能力，空交互清零。
- 设置面板关键项可持久化，并驱动实际行为，至少覆盖自动扫描间隔以及 AI 提交的 API Key、Base URL、模型、提示词、候选数量、Diff 截断和 stagedOnly 配置。
- 自动扫描按设置生效，并能刷新当前界面数据。
- 功能验收通过后，goal 标记 complete。

## Non-Goals

- 不把当前 Vite 应用改造成 Electron 桌面壳。
- 不重做参考 UI 的视觉设计。

## Decisions And Assumptions

- 继续在当前仓库实现，不新开重复 goal。
- 优先补真实能力，再处理边角文案或视觉微调。
- 设置持久化优先用本地浏览器存储；若涉及服务端策略，再通过本地 API 补齐。

## Current State

真实 diff、本地按钮能力、设置持久化和自动扫描均已接入，当前待执行功能验收并完成提交推送。

## Next Action

执行功能验收；若通过则提交并推送当前版本。
