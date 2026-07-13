---
doc_type: codestable-feedback
feedback: 2026-07-13-unnecessary-worktree
status: blocked
created: 2026-07-13
source_providers: [codex]
privacy: local-private
github_issue: ""
---

# CodeStable Feedback: 不必要地创建独立 worktree

## 用户原始反馈

项目默认禁止使用独立工作树，只有确有必要时才允许；本次应把修复合并回当前分支。

## 自动采集范围

- mode: current
- session_filter: current
- since_days_ignored: true
- local_private_evidence: `evidence.json`
- local_private_triage: `triage.json`
- public_preview: `public-issue-context.json`
- incidents: 0
- primary_incident: unknown

## 采集结果

当前工作目录匹配到多个历史会话，metadata-only 模式无法唯一定位本次会话，因此没有读取或持久化会话正文，triage 保持未就绪。

## 已确认事实

- expected_behavior：默认在当前检出实施；仅在当前检出无法安全实施时才创建 worktree，并先说明必要性。
- actual_behavior：本次按 CodeStable 默认执行约定直接创建了独立 worktree。
- impact：增加了不必要的分支、合并和清理步骤。
- proposed_fix：项目级 attention 已追加 worktree 约束。

## 质量门

- triage_ready: false
- regression_ready: false
- incident_fingerprint: unknown
- pending_incident: none
- missing_fields: incident、trigger cutoff、会话证据引用
- reasons: 当前会话定位存在多个候选

## 隐私与上报

- 所有证据均为 local-private。
- 未生成 GitHub 正文，未进行任何网络上传。
