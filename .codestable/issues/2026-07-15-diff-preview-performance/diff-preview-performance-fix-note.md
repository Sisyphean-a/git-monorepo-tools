---
doc_type: issue-fix
issue: 2026-07-15-diff-preview-performance
path: standard
fix_date: 2026-07-15
related: [diff-preview-performance-analysis.md]
tags: [performance, diff, cache, virtualization]
---

# 变更页文件差异展开卡顿 修复记录

## 1. 实际采用方案

采用根因分析中的方案 A，并保持现有行内展开交互：

- 单文件差异接口不再重建整仓快照，只校验仓库、相对路径和目标差异结果。
- 单路径 Git v2 状态在读取前确认 staged/unstaged 成员关系，拒绝 ignored、`.git` 和非当前变更路径。
- 状态与 tracked diff 都使用字面路径，并核对 NUL 分隔状态里的实际文件路径；通配符和目录请求都不会扩大到其他文件。
- 同一仓库扫描版本内缓存已完成结果并复用进行中的请求；扫描版本变化后创建新缓存。
- 缓存换代使用每次仓库详情更新的对象身份，不依赖秒级展示时间；旧 pending 结果与新版本隔离。
- 文件行使用渲染隔离和稳定回调，展开时只更新实际变化的行。
- diff 使用固定行高虚拟渲染，只创建可视区域及前后缓冲行的 DOM。
- 不引入重型编辑器，不截断差异内容，不吞掉读取错误。

## 2. 改动文件清单

- `snapshot/file_diff.go`
- `snapshot/file_diff_test.go`
- `src/app/components/workspace.tsx`
- `src/app/components/diff-list.tsx`
- `src/app/components/file-diff.tsx`
- `src/app/features/diff/file-diff-loader.ts`
- `src/app/features/diff/file-diff-loader.test.ts`
- `src/app/features/diff/diff-viewport.ts`
- `src/app/features/diff/diff-viewport.test.ts`
- `package.json`
- `tsconfig.snapshot-tests.json`

## 3. 验证结果

- `git diff --check`：通过。
- `go test ./...`：通过，最终复跑总耗时 33.3 秒。
- `npm run typecheck`：通过。
- `npm run test:snapshot-coordinator`：通过，54 项测试全部通过。
- `npm run web:build`：通过。
- 修复状态解析后，对真实成功的普通未暂存文件重新运行热路径基准 10 次：平均约 215.23ms → 100.02ms，降低约 53.5%。
- 虚拟窗口测试确认长 diff 只计算可视行与缓冲行，并正确处理首尾边界。
- 两轮审查发现的路径授权、状态空格误判、pathspec/目录扩大匹配、同秒缓存换代和旧滚动位置问题均已补测试并修复。

## 4. 遗留事项

- 当前会话没有提供 in-app Browser 所需的控制连接，未执行真实界面点击和滚动验证；没有用模拟成功替代。需要在桌面端实际复核首次展开、重复展开、长 diff 纵向滚动和长行横向滚动。
- Wails 接口目前没有请求级取消能力；本次通过同文件请求复用减少重复工作，但快速切换不同文件时，已经发出的旧 Git 命令仍会执行完毕。
