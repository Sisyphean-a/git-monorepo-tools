---
doc_type: issue-fix
issue: 2026-07-17-remove-repository-no-response
path: fast-track
fix_date: 2026-07-17
tags: [settings, repository, scan-root, state]
---

# 设置中删除仓库无反应修复记录

## 1. 问题描述

在设置的仓库页删除此前添加的扫描目录后，列表没有立即变化；随后保存设置时，已删除的目录还可能被旧编辑数据写回。

## 2. 根因

删除动作已经更新并持久化外层设置，也触发了仓库快照刷新；但设置弹窗展示的是打开时复制出的编辑数据。弹窗保持打开时不会采用删除后的设置，因此界面继续显示旧目录，保存时也会提交旧数据。

## 3. 修复方案

让应用层删除动作返回规范化、持久化后的最新设置。设置弹窗只合并该结果中的扫描目录，既让界面状态、持久化状态和后续保存内容保持一致，也保留其他标签中尚未保存的编辑内容。

## 4. 改动文件清单

- `src/app/application/settings-actions.ts`
- `src/app/application/settings-actions.test.ts`
- `src/app/components/settings-modal.tsx`

## 5. 验证结果

- `npm run typecheck`：通过。
- `npm run test:snapshot-coordinator`：60 项测试全部通过。
- `npm run web:build`：生产构建通过。
- `git diff --check`：通过，仅有仓库现有的 LF/CRLF 转换提示。
- 新增测试确认删除动作返回剩余目录，并依次更新状态、持久化设置和刷新仓库快照；合并删除结果时不会覆盖其他未保存设置。

## 6. 遗留事项

按用户要求未进行浏览器交互验证；本次通过应用层单元测试、类型检查和生产构建验证。
