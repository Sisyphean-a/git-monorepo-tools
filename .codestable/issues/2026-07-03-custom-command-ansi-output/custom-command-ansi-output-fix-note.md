---
doc_type: issue-fix
issue: 2026-07-03-custom-command-ansi-output
path: fast-track
fix_date: 2026-07-03
tags: [command-center, console-output, windows]
---

# 自定义命令输出 ANSI 控制码显示成乱码 修复记录

## 1. 问题描述

Windows 下执行自定义命令时，输出面板会直接显示 `[1;33m` 这类控制串，像乱码一样夹在正常文本里；`wails build` 这类带颜色输出的命令最明显。

## 2. 根因

命令执行器按字节读取子进程 stdout/stderr 后，直接把内容写进流式事件和最终结果，没有去掉终端颜色控制码。前端面板是纯文本展示，不会解释这些控制码，于是原样露出来。

## 3. 修复方案

在后端命令执行器加一个分片安全的 ANSI 清洗器，统一在读取 stdout/stderr 时去掉控制码。除了常见的 `ESC [` 颜色序列，也补上 `ESC P / X / ^ / _` 这类控制字符串，让流式输出和最终结果都只保留可读文本。

## 4. 改动文件清单

- `snapshot/command_runner.go`：新增 ANSI 清洗状态机，并在命令输出流里统一清洗颜色序列和控制字符串。
- `snapshot/command_runner_test.go`：新增普通输出、流式输出、控制字符串和分片场景回归测试。

## 5. 验证结果

- `go test ./snapshot -run "Command|Ansi" -count=1` 通过。
- `go test ./snapshot` 通过。

## 6. 遗留事项

无
