---
doc_type: audit-finding
audit: 2026-07-11-sidebar-related-logic
finding_id: "bug-03"
nature: bug
severity: P2
confidence: high
suggested_action: cs-issue
status: resolved
---

# Finding 03：重复自定义分类产生重复 React key 和分组

## 速答

自定义分类既不去重也不统一规范化，重复添加同名分类后，侧边栏会用重复 key 渲染多个同名分组。

## 关键证据

- `src/app/App.tsx:147` — `handleAddCategory` 只校验非空，随后直接把名称追加到数组，没有检查已有分类。
- `src/app/settings.ts:84` — 从 localStorage 恢复时仅过滤空字符串，不 trim、不去重。
- `src/app/App.tsx:273` — 合并分类时只排除已存在于快照的分类，未消除 `customCategories` 自身的重复项。
- `src/app/components/sidebar.tsx:301` — 分类名称直接作为 React key；同名项会触发重复 key 并产生不稳定的组件状态复用。

## 影响

用户重复添加同名分类，或本地设置中已有重复值时，会看到重复空分组，控制台出现 key 冲突，分组折叠状态可能关联到错误实例。

## 修复方向

在设置净化边界统一 trim 并按明确的大小写规则去重，同时在添加分类时拒绝重复名称。

## 建议动作

`cs-issue`，因为输入边界缺失已导致可见的重复渲染行为。
