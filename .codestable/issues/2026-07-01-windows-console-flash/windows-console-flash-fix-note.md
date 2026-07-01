---
doc_type: issue-fix
issue: 2026-07-01-windows-console-flash
path: standard
fix_date: 2026-07-01
related:
  - .codestable/issues/2026-07-01-windows-console-flash/windows-console-flash-analysis.md
tags: [windows, desktop, wails, git, ux, performance]
---

# Windows 控制台黑框闪烁修复记录

## 1. 实际采用方案

采用 analysis 中的**方案 B**：

- 在 `snapshot` 包统一给 Windows 下的 Git 子进程应用 `HideWindow + CREATE_NO_WINDOW`，避免桌面 GUI 拉起 `git.exe` 时闪出控制台。
- 把历史统计从“1 次 `git log` + 5 次 `git show`”改成单次 `git log --shortstat` 解析，减少每轮扫描的 Git 子进程数量。
- 给前端自动扫描加防重入，避免上一轮扫描未结束时继续叠加新的后台刷新。

## 2. 改动文件清单

- `snapshot/git.go`
- `snapshot/operations.go`
- `snapshot/process_windows.go`
- `snapshot/process_other.go`
- `src/app/App.tsx`
- `.codestable/attention.md`
- `.codestable/issues/2026-07-01-windows-console-flash/worktree-override.md`
- `.codestable/issues/2026-07-01-windows-console-flash/windows-console-flash-analysis.md`

## 3. 验证结果

- `go test ./...`：passed
- `npm run build`：passed（实际调用 `wails build`）
- `codestable-worktree-gate start`：passed（override 生效）
- 黑框根因验证：`runGit()` 与 `runGitStrict()` 现均统一走 Windows 隐藏窗口属性；启动、自动扫描、批量操作、日志读取都会覆盖到该路径
- 性能验证：历史统计改为单次 `git log --shortstat`；自动扫描新增防重入，减少后台重复扫描

## 4. 遗留事项

- 本轮未做桌面窗口视觉层自动化，黑框消失的最终体验需在 Windows 双击 `build/bin/git-monorepo-tools.exe` 手工复核。
- 本轮未继续扩展到更大范围的快照缓存或仓库扫描策略调整，保持在 issue 声明范围内。
