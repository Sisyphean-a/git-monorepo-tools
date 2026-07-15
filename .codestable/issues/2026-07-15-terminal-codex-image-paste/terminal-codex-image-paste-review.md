---
doc_type: issue-review
issue: 2026-07-15-terminal-codex-image-paste
status: passed
reviewer: subagent+ocr
reviewed: 2026-07-15
round: 2
---

# 终端 Codex 图片粘贴代码审查报告

## 1. Scope And Inputs

- Design: 快速通道，无独立 design
- Checklist: 快速通道，无独立 checklist
- Evidence pack: none
- Gate results: none
- DoD results: none
- Implementation evidence: 用户确认的修复范围、fix-note、自动化测试和 Windows 生产构建结果
- Diff basis: 当前工作区 `git status` 与 `git diff`
- Baseline dirty files: none

### Independent Review

- Detection: 原生 Codex Task agent 与 OCR CLI 可用
- 环节 A 独立隔离 Task agent: native-agent + completed
- 环节 B OCR CLI: completed
- OCR severity mapping: High→blocking/important，Medium→nit/suggestion，Low→discarded
- Merge policy: 两个环节结果均经本地仓库事实核验后合并
- Gate effect: none

## 2. Diff Summary

- 新增：本 issue 的 fix-note、review 和 worktree override
- 修改：终端快捷键 helper、终端组件接线、对应测试及生成的测试 JavaScript
- 删除：none
- 未跟踪 / staged：issue 目录未跟踪，其他改动未暂存
- 风险热点：Windows 剪贴板错误语义、异步输入顺序、键盘与右键行为分流

## 3. Adversarial Pass

- 假设的生产 bug：Wails 图片剪贴板以 Promise 拒绝而非空文本返回，导致回退仍不执行
- 主动攻击过的反例：空文本、读取拒绝、右键误回退、文本粘贴回归、输入队列时序、测试接线假阳性
- 结果：首轮发现测试接线假阳性并完成窄修复；复审后无 blocking 或 important

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

- Wails 2.11 在 Windows 剪贴板缺少 Unicode 文本格式时可能拒绝读取，图片回退必须同时覆盖空文本和 Promise 拒绝。

### praise

- 粘贴来源成为必填类型，键盘与右键的回退策略由 helper 统一决定，避免调用点误配控制字符。
- 文本仍先经过 xterm 粘贴转换，所有写入继续复用原有输入队列。

## 5. Test And QA Focus

- QA 必须重点复核：在 Windows 桌面程序的 Codex 中粘贴截图、浏览器图片和文件图片；同时回归单行、多行文本与右键粘贴。
- Evidence pack residual risks / gate warnings：真实系统图片剪贴板无法由当前自动化环境注入。
- 建议新增或加强的测试：当前 helper 测试已覆盖键盘与右键的空文本和读取拒绝语义。
- 不能靠 review 完全确认的点：Wails WebView、Windows 图片格式与 Codex TUI 的真实联动。

## 6. Residual Risk

- 同时包含图片与非空文本的剪贴板仍优先粘贴文本，符合本次“无文本时回退”的修复契约。
- 剪贴板读取期间终端会话重启可能写向旧会话，这是既有时序风险，不属于本次改动。

## 7. Verdict

- Status: passed
- Next: 返回 issue 修复流程，由用户在真实 Windows 桌面程序中确认图片粘贴结果。
