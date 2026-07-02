---
doc_type: issue-fix
issue: 2026-07-02-default-scan-roots
path: fast-track
fix_date: 2026-07-02
tags: [repositories, scan-roots]
---

# 默认扫描根导致仓库被自动加入 修复记录

## 1. 问题描述

用户未添加扫描目录时，应用仍会自动扫描当前项目上级目录和盘符根目录，把一批仓库自动加进列表；设置页空状态也把这种行为描述成“默认工作区”。

## 2. 根因

后端构建扫描根时，会无条件注入两个默认目录：当前项目的上级目录，以及当前盘符根目录。这样即使 `scanRoots` 为空，仓库发现逻辑仍会从这些目录里扫出仓库。生成快照脚本也复制了同样的默认逻辑，导致行为不一致风险持续存在。

## 3. 修复方案

移除代码里硬编码的默认扫描根，只保留用户显式添加的扫描目录；同步更新生成快照脚本；把设置页空状态文案改成“未配置扫描目录”，避免再误导成系统默认会自动扫描。

## 4. 改动文件清单

- `snapshot/service.go`：删除默认工作区/盘符根目录注入，只保留请求里的显式扫描根。
- `snapshot/service_test.go`：新增回归测试，验证空配置时不注入默认扫描根，且显式目录仍会被保留和去重。
- `scripts/sync-real-data.mjs`：移除脚本侧默认扫描根，保持和主服务一致。
- `src/app/components/settings-modal.tsx`：更新空状态提示文案。

## 5. 验证结果

- `go test ./snapshot/...` 通过。
- 脚本级 smoke test 通过：在当前仓库执行 `buildAppSnapshot(process.cwd(), undefined, [])`，输出 `{"repos":0,"categories":[],"selectedRepoId":""}`，确认空配置不会再自动带出仓库。

## 6. 遗留事项

无
