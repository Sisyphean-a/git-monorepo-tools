---
doc_type: audit-index
audit: 2026-07-10-git-performance
scope: Git 暂存、单仓刷新、全局刷新、自动扫描、批量同步和日志读取的性能链路
created: 2026-07-10
status: active
total_findings: 5
---

# Git 操作性能审计报告

## 范围

检查了前端的暂存、刷新和自动扫描入口，Wails 后端的 Git 子进程调用，以及状态、文件列表、历史和批量同步的构建逻辑。

## 总评

当前的主要问题不是单条 `git add` 写入索引，而是每次暂存成功后都会同步重建完整仓库详情。一次本地单仓更新至少读取状态、暂存和未暂存两份 numstat、最近 51 个提交的 numstat，并对每个变更文件做本地文件系统访问。当前工作区的拆分实测约为 430.4 ms，且这里只有 1 个未跟踪项；大仓库、生成目录或大量历史时会显著放大。

最影响交互的是全局远端刷新：它会逐仓抓取远端，并与暂存共用一个先进先出的队列。自动扫描或侧栏刷新正在执行时，用户的暂存操作会先等待整次刷新结束。

## 发现清单

| # | 性质 | 严重度 | 置信度 | 标题 | 文件 |
|---|---|---|---|---|---|
| 1 | performance | P1 | high | 暂存一个文件后重建完整仓库详情 | [finding-01.md](finding-01.md) |
| 2 | performance | P1 | high | 未跟踪目录被递归枚举并逐文件读行数 | [finding-02.md](finding-02.md) |
| 3 | performance | P1 | high | 全局远端刷新和自动扫描阻塞交互式暂存 | [finding-03.md](finding-03.md) |
| 4 | performance | P2 | high | 批量同步前后各做一次完整扫描且实际同步串行 | [finding-04.md](finding-04.md) |
| 5 | performance | P2 | high | 日志查看读取完整提交统计文本 | [finding-05.md](finding-05.md) |

## 按维度分布

| 性质 | P0 | P1 | P2 | 合计 |
|---|---:|---:|---:|---:|
| bug | 0 | 0 | 0 | 0 |
| security | 0 | 0 | 0 | 0 |
| performance | 0 | 3 | 2 | 5 |
| maintainability | 0 | 0 | 0 | 0 |
| arch-drift | 0 | 0 | 0 | 0 |
| **合计** | **0** | **3** | **2** | **5** |

## 实测

对当前工作区的本地 Git 读取各执行三次，均值如下：`status --porcelain=v1 -b` 75.8 ms、暂存 numstat 82.7 ms、未暂存 numstat 92.5 ms、最近 51 个提交的 numstat 179.4 ms。仅四个 Git 命令已合计 430.4 ms，未计入子进程启动、逐文件 `stat`、未跟踪文件读行数、Wails 传输和 React 渲染。

仓库已有的 `BenchmarkBuildAppSnapshotConcurrency` 在本机未发现仓库而失败，不能代表真实项目；当前没有覆盖“大量未跟踪文件、大量改动、慢远端”的可复现基准。

## 下一步建议

- **P1 本迭代修**：先处理 finding-01、finding-02、finding-03；它们直接解释暂存和刷新卡顿。
- **P2 排期处理**：批量同步和日志读取在多仓库或大提交历史下再优化。
