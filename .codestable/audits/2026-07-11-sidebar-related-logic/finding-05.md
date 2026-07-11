---
doc_type: audit-finding
audit: 2026-07-11-sidebar-related-logic
finding_id: "bug-05"
nature: bug
severity: P1
confidence: high
suggested_action: cs-issue
status: resolved
---

# Finding 05：Git 操作回写丢失分类导致仓库不可见

## 速答

右侧执行放弃更改等 Git 操作后，后端生成的单仓库更新会把 `category` 置为空字符串；侧边栏只渲染已知分类中的仓库，因此目标仓库会真正从列表中消失。

## 关键证据

- `src/app/use-repo-command-panel.tsx:190` — 放弃更改调用 `onMutateRepo` 时只传递 `repoPath`，没有传递仓库分类。
- `snapshot/repo_resolution.go:106` — stage、unstage、commit、discard-all 的路径快速解析只构造 `ID` 和 `Path`，`Category` 保持空值。
- `snapshot/repo_resolution.go:121` — pull、push 等其他带路径操作通过 `resolveRepoByPath`，同样用不含分类的 `repoEntry` 重建详情。
- `snapshot/operations.go:19` — 操作成功后把空的 `repo.Category` 传给 `buildRepoUpdate`，更新结果中的分类因此为空。
- `src/app/repo-snapshot-merge.ts:11` — 前端按 ID 用该结果完整替换原仓库，原有分类没有保留。
- `src/app/components/sidebar.tsx:298` — 侧边栏只选择 `repo.category === category` 的仓库；现有 `categories` 不包含空字符串，更新后的仓库不再进入任何分组。

## 影响

在右侧执行暂存全部、取消暂存、单文件暂存/取消暂存、提交、Pull、Push、放弃更改等操作成功后均可能稳定触发。仓库仍存在于内存快照和右侧详情中，但左侧无法再次选择，直到执行一次完整扫描恢复分类。

此外，放弃更改会把 `modified` 归零并触发重新排序；修复分类丢失后，仓库仍可能移动到分组靠后位置，但不应再不可见。

## 修复方向

让单仓库操作解析结果始终保留可信分类，并在前端合并更新时增加分类不变量测试，覆盖所有 mutation action。

## 建议动作

`cs-issue`，因为这是可稳定复现、直接破坏侧边栏导航的跨层数据完整性缺陷。
