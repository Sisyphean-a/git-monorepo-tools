---
doc_type: issue-fix
issue: 2026-07-04-terminal-session-key-case
path: fast-track
fix_date: 2026-07-04
tags: [terminal, session-manager, path-normalization]
---

# 仓库终端 session key 大小写误合并 修复记录

## 1. 问题描述

仓库终端的 session 复用键会把仓库路径无条件转成小写。这样在大小写敏感文件系统上，`/repo/App` 和 `/repo/app` 会被当成同一个仓库，错误复用同一个终端 session。

## 2. 根因

`terminal_manager.go` 里的 `repoSessionKey()` 直接对 `filepath.Clean(repoPath)` 执行 `strings.ToLower(...)`，没有区分底层文件系统的大小写语义。

## 3. 修复方案

不再把 repo 复用语义绑到路径字符串或 `GOOS`。改为在建 session 时保存目录的 `os.Stat` 结果，后续复用时用 `os.SameFile` 判断是否指向同一个真实目录；只有拿不到有效文件 identity 时才退回清洗后的绝对路径比较。这样 case-insensitive 卷和 symlink alias 都能稳定复用已有 session。

## 4. 改动文件清单

- `terminal_manager.go`：移除字符串 key map，改为按目录 identity 复用 session，并把 repo `FileInfo` 挂到 session 上。
- `terminal_repo_match.go`：新增真实目录 identity 比较逻辑，优先走 `os.SameFile`。
- `terminal_repo_match_test.go`：新增大小写别名、symlink alias、不同目录三类回归测试。
- `.codestable/goals/2026-07-04-repo-terminal-tab/functional-acceptance.md`：移除已修复的残余风险说明。

## 5. 验证结果

- `go test ./...` 通过。
- `go test -run TestSameTerminalRepo -count=1` 通过。

## 6. 遗留事项

无。
