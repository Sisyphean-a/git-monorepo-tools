# ai-commit-parity goal spec

- Roadmap item: `ai-commit-parity`
- Design: `.codestable/features/2026-07-01-ai-commit-parity/ai-commit-parity-design.md`
- Checklist: `.codestable/features/2026-07-01-ai-commit-parity/ai-commit-parity-checklist.yaml`
- Design review: `.codestable/features/2026-07-01-ai-commit-parity/ai-commit-parity-design-review.md`
- Review: `.codestable/features/2026-07-01-ai-commit-parity/ai-commit-parity-review.md`
- QA: `.codestable/features/2026-07-01-ai-commit-parity/ai-commit-parity-qa.md`
- Acceptance: `.codestable/features/2026-07-01-ai-commit-parity/ai-commit-parity-acceptance.md`
- Depends on: `git-operation-parity`
- Feature type: functional
- Core runtime path: `wails dev` 下生成 staged-only commit candidates
- Mandatory commands: `wails dev`
- Feature DoD: staged-only、生成功能、摘要化与候选结构保持稳定
- Stage gates: implementation.before_review, review.before_pass, qa.before_acceptance, acceptance.before_done
- Gate inputs: design, checklist, prompt/diff evidence, screenshot
- Failure recovery: 输入边界或模型调用问题回 impl；review blocking 回 review-fix；QA failed 回 qa-fix 并重跑 review/QA
- Acceptance evidence: diff_summary, screenshot, acceptance_report
- Deliverables: Go AI commit 服务与绑定
- Cleanliness: 禁止调试输出、TODO、注释掉代码、无用 import
