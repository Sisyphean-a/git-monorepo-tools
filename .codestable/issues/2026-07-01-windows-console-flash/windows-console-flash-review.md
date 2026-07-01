---
doc_type: issue-review
issue: 2026-07-01-windows-console-flash
status: passed
reviewed: 2026-07-01
reviewer: ocr
round: 2
---

# Windows 控制台黑框闪烁代码评审报告

## 1. Scope And Inputs

- Report: `.codestable/issues/2026-07-01-windows-console-flash/windows-console-flash-report.md`
- Analysis: `.codestable/issues/2026-07-01-windows-console-flash/windows-console-flash-analysis.md`
- Fix note: `.codestable/issues/2026-07-01-windows-console-flash/windows-console-flash-fix-note.md`
- Diff basis: 当前未提交 diff，聚焦 `snapshot/`、`src/app/App.tsx`、`.codestable/attention.md` 与本 issue 文档
- Independent Review: OCR 已可用并完成一轮审查；首轮指出 `snapshot/git.go` 历史统计解析依赖英文短统计文本，现已改为 `git log --numstat` 并通过第二轮 OCR 复审。当前仍无独立 Task agent reviewer。

## 2. Review Summary

- Windows 下 Git 子进程隐藏窗口属性已统一收口到 `snapshot` 包，覆盖首屏扫描、后台刷新、批量操作和日志读取。
- 历史统计从多次 Git 子进程调用压缩为单次 `git log --numstat` 解析，避免了本地化输出依赖，且未扩大到本 issue 范围外。
- 自动扫描防重入只作用于后台定时刷新，不会改变手动刷新与显式 Git 操作入口。

## 3. Findings

### blocking

none

### important

none

### nit

- [ ] R-001 当前没有自动化手段直接证明“视觉上不再闪黑框”，仍需在 Windows 双击 `build/bin/git-monorepo-tools.exe` 做一次人工复核。

### suggestion

- [ ] R-002 如果后续仍觉得扫描偏慢，可以另开 issue 继续收敛仓库发现策略或快照缓存，不要混进本次黑框修复。

### learning

- `RepoMirror` 的 `HideWindow + CREATE_NO_WINDOW` 模式适合作为当前仓库桌面 Git 子进程的统一口径，直接复用比另起 shell 包装更稳。
- OCR 首轮抓出的 locale 依赖是有效问题：涉及 Git 输出解析时，应优先使用 `--numstat` 这类稳定格式，而不是依赖自然语言短统计文本。

### praise

- 修复把黑框问题和性能收敛都限定在 `snapshot` 与自动扫描链路，没有顺手扩散到桌面桥接层。

## 4. User Review Focus

- 复核双击 `exe` 首屏扫描时是否还会闪多个控制台窗口。
- 复核应用空闲一段时间后的后台自动扫描不再反复弹黑框。
- 复核历史 tab 仍能显示最近提交及增删统计。

## 5. Residual Risk

- 本轮已有 OCR 审查，但仍缺独立 Task agent reviewer；若严格按 CodeStable gate 收尾，仍需补一轮 Task agent review。
