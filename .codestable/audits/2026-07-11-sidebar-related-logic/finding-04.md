---
doc_type: audit-finding
audit: 2026-07-11-sidebar-related-logic
finding_id: "maintainability-04"
nature: maintainability
severity: P2
confidence: high
suggested_action: cs-refactor
status: resolved
---

# Finding 04：侧边栏文件和主函数远超项目复杂度基线

## 速答

`sidebar.tsx` 同时承担品牌头、搜索、分组、仓库项、批量操作、刷新和自动扫描设置，文件与主函数长度均超过项目硬性指标。

## 关键证据

- `src/app/components/sidebar.tsx:1` — 文件共 425 行，超过项目约定的 300 行上限。
- `src/app/components/sidebar.tsx:175` — `Sidebar` 从第 175 行持续到第 425 行，约 251 行，超过函数 50 行上限。
- `src/app/components/sidebar.tsx:279` — 列表分支、空状态、分类过滤与仓库项构建嵌套在主组件中。
- `src/app/components/sidebar.tsx:313` — 批量同步、刷新、错误和自动扫描控制也内嵌在同一主组件。

## 影响

侧边栏任一功能改动都容易触碰同一大组件，测试难以按职责隔离，也放大了 Finding 01 中父组件重渲染的成本。

## 修复方向

按头部搜索、仓库列表、底部操作区拆分组件，并把分类索引计算与终端状态订阅移到更细粒度边界。

## 建议动作

`cs-refactor`，因为问题属于不改变现有行为的职责拆分与渲染边界优化。
