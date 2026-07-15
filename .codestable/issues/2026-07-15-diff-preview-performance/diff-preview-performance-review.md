---
doc_type: issue-review
issue: 2026-07-15-diff-preview-performance
status: passed
reviewer: subagent+ocr
reviewed: 2026-07-15
round: 2
---

# diff-preview-performance 代码审查报告

## 1. Scope And Inputs

- 来源：issue 标准修复流程
- 输入：report、analysis、fix-note、当前工作区 diff、自动化结果和热路径基准
- Diff basis: 当前工作区 unstaged + untracked；staged 为空

### Independent Review

- 环节 A：原生隔离 Task agent，completed
- 环节 B：OCR CLI，completed；有效扫描无 finding
- 审查轮次按用户要求收口为两轮；第二轮修复后的边界由定向测试和完整测试验证，不再启动新一轮 reviewer

## 2. Diff Summary

- 后端：单文件 diff 从整仓快照改为路径级状态与 diff；严格确认 staged/unstaged、实际文件路径和访问边界。
- 前端：增加快照内缓存、进行中请求复用、文件行渲染隔离、虚拟窗口和滚动帧合并。
- 测试：覆盖缓存换代、旧请求隔离、虚拟窗口、Git 状态分类、特殊路径和目录拒绝。

## 3. Adversarial Pass

- 第一轮发现敏感路径读取、同秒缓存未失效和滚动位置越界，均已修复。
- 第二轮重点攻击仅未暂存状态、Git 通配路径、字面目录递归、ignored/`.git`、旧 pending 和长 diff 边界，均已修复或进入 residual risk。

## 4. Findings

### blocking

none

### important

none

### nit

none

### suggestion

none

### learning

- Git porcelain v1 的前导空格是状态数据；改用 v2 后解析不再受公共 `TrimSpace` 影响。
- literal pathspec 只关闭通配语法，目录仍会递归；必须核对 NUL 分隔状态中的实际路径。

### praise

- 后端没有恢复整仓扫描，也没有用截断或吞错换性能。
- loader 换代和来源标记能隔离旧异步结果；虚拟窗口只渲染可视行与缓冲行。

## 5. Test And QA Focus

- 已自动验证 unstaged-only、staged-only、`MM`、untracked、特殊文件名、通配请求、目录请求、ignored、`.git` 和非变更文件。
- 已验证同秒缓存换代、旧 pending 隔离、内容缩短后的滚动夹取。
- 真实桌面端仍应关注首次展开、重复展开、长 diff 纵横滚动。

## 6. Residual Risk

- 当前会话无 in-app Browser 控制连接，未执行真实 Wails WebView 点击与滚动验证。
- 极大 diff 首次仍需拆分全部内容并扫描最长行；同版本会缓存完整内容。
- 快速切换不同文件时，旧 Git 进程仍不能取消，但旧结果不会覆盖当前内容。

## 7. Verdict

- Status: passed
- 两轮审查发现项均已修复并通过定向测试、完整测试、类型检查和生产构建。
