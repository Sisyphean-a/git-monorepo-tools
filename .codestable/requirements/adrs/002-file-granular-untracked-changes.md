---
id: 002
title: 逐文件展示未跟踪变更
status: accepted
date: 2026-07-13
scope: workspace
---

# 逐文件展示未跟踪变更

## 背景

目录聚合会使变更数量和常见 Git 客户端不一致，也让逐文件暂存、预览和筛选缺少稳定的数据粒度。

## 决定

仓库状态使用 `git status --porcelain=v1 -b --untracked-files=all`。每个未跟踪文件生成独立的 `FileChange`；仓库变更数、未暂存数和详情列表均按实际文件计数。

## 备选与后果

保留目录聚合或点击后再展开会让当前列表的口径不一致；硬性条数限制会静默遗漏变更，因此不采用。大量未跟踪文件会增加 Git 输出、处理和传输成本，性能优化必须保留完整展示。

## 代码锚点

`snapshot/git_status.go`、`snapshot/types.go`、`src/app/domain/types.ts`、`src/app/domain/repo-status.ts`。
