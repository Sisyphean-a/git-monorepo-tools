---
doc_type: audit-finding
audit: 2026-07-10-git-performance
finding_id: "performance-02"
nature: performance
severity: P1
confidence: high
suggested_action: cs-refactor
status: open
---

# Finding 02：未跟踪目录被递归枚举并逐文件读行数

## 速答

只要 Git 状态返回一个未跟踪目录，应用就递归列出其全部子文件，并为每个文件读取大小和行数；一个未忽略的构建产物、缓存或依赖目录会让暂存和刷新退化为全目录扫描。

## 关键证据

- `snapshot/git.go:383` — `buildUntrackedChanges` 遍历每个未跟踪状态条目。
- `snapshot/git.go:393` — 目录条目交给 `expandUntracked` 展开为每个子文件。
- `snapshot/git.go:401` — 每个文件都调用 `countFileLines` 和 `resolveSize`，意味着除了目录枚举，还要打开文件扫描内容并读取元数据。
- `snapshot/git.go:409` — 未跟踪路径是目录时进入递归扫描；`snapshot/git.go:418` 至 `snapshot/git.go:435` 没有深度、文件数或大小上的停止条件。

## 影响

这条路径是项目差异很大、特别是误提交或漏忽略 `node_modules`、构建目录、日志目录时卡死式变慢的直接原因。结果还会传给前端一次性渲染全部文件行，进一步放大停顿。

## 修复方向

不要在常规刷新中为所有未跟踪文件计算行数；文件详情和目录展开应按需读取，并沿用 Git 的忽略规则和分页结果。

## 建议动作

`cs-refactor`，因为需要改变文件列表的加载模型，而不是掩盖慢目录。
