---
doc_type: issue-review
issue: 2026-07-07-terminal-paste-duplicates
status: passed
reviewer: ocr
reviewed: 2026-07-07
round: 1
---

# terminal-paste-duplicates 代码审查报告

## 1. Scope And Inputs

- Design: none（快速通道，按用户确认的修复方案执行）
- Checklist: none
- Evidence pack: none
- Gate results: none
- DoD results: none
- Implementation evidence: 当前对话中的根因确认、修复方案确认、fix-note 与测试结果
- Diff basis: `git status --short` + 本次相关文件 `git diff`
- Baseline dirty files: none

### Independent Review

- Detection: 未检测到可直接使用的用户授权独立 subagent；`ocr` CLI 可用
- 环节 A 独立隔离 Task agent: local-only + skipped-by-user
- 环节 B OCR CLI: completed
- OCR severity mapping: High→blocking/important，Medium→nit/suggestion，Low→discarded
- Merge policy: `ocr` 结果与本地 diff、测试结果逐条对照；本轮 `ocr` 未产出 comment
- Gate effect: 使用 `reviewer: ocr`，commit gate 需配 self-review fallback 放行

## 2. Diff Summary

- 新增：`.codestable/issues/2026-07-07-terminal-paste-duplicates/worktree-override.md`、`.codestable/issues/2026-07-07-terminal-paste-duplicates/terminal-paste-duplicates-fix-note.md`、`.codestable/issues/2026-07-07-terminal-paste-duplicates/terminal-paste-duplicates-review.md`
- 修改：`src/app/components/repo-terminal-shortcuts.ts`、`src/app/components/repo-terminal-shortcuts.test.ts`、`src/app/components/repo-terminal-surface.tsx`、对应 `.tmp/snapshot-tests/components/` 生成镜像
- 删除：none
- 未跟踪 / staged：issue 目录未跟踪，未 staged
- 风险热点：UI 输入链路、终端快捷键行为

## 3. Adversarial Pass

- 假设的生产 bug：去掉 `Ctrl+V` 拦截后，Windows 下终端可能彻底失去粘贴能力
- 主动攻击过的反例：`Ctrl+C` 选区复制是否被误伤；`Ctrl+V` 是否仍会走 `xterm` 默认链路；右键粘贴逻辑是否仍保留单次发送；单测是否同步覆盖新的快捷键语义
- 结果：未发现会阻塞本次修复目标的问题；`Ctrl+V` 放行与 `xterm` 默认粘贴的契约属于运行时行为，保留到 QA 手工复核

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

- 终端输入链路里，浏览器原生事件和 `xterm` 自带事件处理容易叠加；补快捷键前要先确认组件自身有没有内建行为。

### praise

- 本次修复保持在最小范围，只移除了重复的 `Ctrl+V` 分支，同时把单测语义一起改到位。

## 5. Test And QA Focus

- QA 必须重点复核：Windows 下终端 `Ctrl+V` 单次粘贴；右键无选区粘贴仍只上屏一次；有选区时右键和 `Ctrl+C` 复制仍正常
- Evidence pack residual risks / gate warnings：review 环节因无用户授权 subagent，按 `ocr` 降级执行
- 建议新增或加强的测试：none
- 不能靠 review 完全确认的点：`xterm` 在 Wails 桌面容器里的真实原生粘贴事件链路，需要手工点一下确认

## 6. Residual Risk

- `Ctrl+V` 现改为完全依赖 `xterm` 默认粘贴链路。代码和依赖实现都支持这个路径，但最终仍应在 Windows 桌面端手工点一次确认。

## 7. Verdict

- Status: passed
- Next: issue 提交流程收尾
