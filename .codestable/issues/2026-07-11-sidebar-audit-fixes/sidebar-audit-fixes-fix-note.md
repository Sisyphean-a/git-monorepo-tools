---
doc_type: issue-fix
issue: 2026-07-11-sidebar-audit-fixes
path: fast-track
fix_date: 2026-07-11
tags: [sidebar, git, terminal, settings]
---

# 侧边栏审计问题修复记录

## 1. 问题描述

修复侧边栏审计中的 5 条问题：Git 操作后仓库分类丢失、添加目录异常未处理、重复分类、终端输出导致高频整树渲染，以及侧边栏组件职责过重。

## 2. 根因

- Git 操作的路径快速解析只保留仓库 ID 和路径，单仓库快照回写时分类为空。
- 添加目录入口丢弃异步 Promise，处理函数未捕获原生对话框和刷新异常。
- 自定义分类净化只过滤空值，不 trim 和去重。
- 每个终端输出块都会发布新的全局状态快照。
- 侧边栏头部、列表和操作区集中在一个 425 行组件中。

## 3. 修复方案

- 操作请求携带 `repoCategory`；后端分类为空时禁止走快速路径，从扫描条目恢复可信分类。
- 添加目录异常写入现有可见错误状态。
- 设置净化统一 trim/去重，新增分类时拒绝现有名称。
- 连续 active 输出只更新时间戳和衰减定时器，不重复通知 React。
- 拆分 Header、RepoList、Footer，并按单次遍历构建分类索引。

## 4. 改动文件清单

涉及 `snapshot` 仓库解析与测试、前端 App/settings/terminal 状态、Wails 类型、侧边栏组件及样式、测试配置。用户任务前已有的 `frontend/wailsjs/go/main/App.js` 与 `App.d.ts` 改动未触碰；`models.ts` 仅增量同步 `repoCategory`。

## 5. 验证结果

- `go test ./...`：通过。
- `npm run test:snapshot-coordinator`：47 项通过。
- `npm run web:build`：通过。
- 独立代码审查：发现的空分类兼容路径 blocking 已修复并回归验证。

## 6. 遗留事项

浏览器自动验证因浏览器连接缺少沙箱元数据而未执行；桌面 Wails 运行态视觉交互仍需人工冒烟确认。

