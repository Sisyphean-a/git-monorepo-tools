---
doc_type: audit-index
audit: 2026-07-11-sidebar-related-logic
scope: 左侧侧边栏、仓库选择与状态展示、终端状态订阅、分类和快照关联逻辑
created: 2026-07-11
status: resolved
total_findings: 5
---

# 左侧侧边栏及关联逻辑审计报告

## 范围

扫描 `src/app/components/sidebar.tsx`、`repo-list-status.tsx`、`App.tsx`、`repo-terminal-status.ts`、快照刷新/合并逻辑，以及目录选择和分类生成的后端关联路径。检查 bug、安全、性能、可维护性，并对照现有 ADR 检查架构偏离。

## 总评

共发现 5 条：bug 3 条、performance 1 条、maintainability 1 条；P1 3 条、P2 2 条。最严重的是 Git 操作回写丢失分类后仓库会从侧边栏消失；终端输出导致侧边栏整树高频重渲染也值得优先处理。未发现明确的安全问题或违反现有 ADR 的架构偏离。

## 发现清单

| # | 性质 | 严重度 | 置信度 | 标题 | 文件 |
|---|---|---|---|---|---|
| 1 | performance | P1 | high | 终端每次输出都重渲染完整侧边栏 | [finding-01.md](finding-01.md) |
| 2 | bug | P1 | medium | 添加目录失败形成未处理 Promise | [finding-02.md](finding-02.md) |
| 3 | bug | P2 | high | 重复自定义分类产生重复 React key 和分组 | [finding-03.md](finding-03.md) |
| 4 | maintainability | P2 | high | 侧边栏文件和主函数远超项目复杂度基线 | [finding-04.md](finding-04.md) |
| 5 | bug | P1 | high | Git 操作回写丢失分类导致仓库不可见 | [finding-05.md](finding-05.md) |

## 按维度分布

| 性质 | P0 | P1 | P2 | 合计 |
|---|---|---|---|---|
| bug | 0 | 2 | 1 | 3 |
| security | 0 | 0 | 0 | 0 |
| performance | 0 | 1 | 0 | 1 |
| maintainability | 0 | 0 | 1 | 1 |
| arch-drift | 0 | 0 | 0 | 0 |
| **合计** | **0** | **3** | **2** | **5** |

## 下一步建议

- **P1 本迭代修**：Finding 01、02、05；Finding 05 会直接导致仓库从列表消失，优先级最高。
- **P2 后续处理**：Finding 03、04，建议分别进入 `cs-issue` 和 `cs-refactor`。
