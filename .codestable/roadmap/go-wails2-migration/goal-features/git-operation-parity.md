# git-operation-parity goal spec

- Roadmap item: `git-operation-parity`
- Design: `.codestable/features/2026-07-01-git-operation-parity/git-operation-parity-design.md`
- Checklist: `.codestable/features/2026-07-01-git-operation-parity/git-operation-parity-checklist.yaml`
- Design review: `.codestable/features/2026-07-01-git-operation-parity/git-operation-parity-design-review.md`
- Review: `.codestable/features/2026-07-01-git-operation-parity/git-operation-parity-review.md`
- QA: `.codestable/features/2026-07-01-git-operation-parity/git-operation-parity-qa.md`
- Acceptance: `.codestable/features/2026-07-01-git-operation-parity/git-operation-parity-acceptance.md`
- Depends on: `wails-shell-bootstrap`
- Feature type: functional
- Core runtime path: `wails dev` 下执行 snapshot、单仓库动作与 batch 动作
- Mandatory commands: `wails dev`
- Feature DoD: 核心 Git 行为从 Go 可用，错误与跳过语义稳定
- Stage gates: implementation.before_review, review.before_pass, qa.before_acceptance, acceptance.before_done
- Gate inputs: design, checklist, diff, command evidence, semantic comparison notes
- Failure recovery: 行为不等价回 impl；review blocking 回 review-fix；QA failed 回 qa-fix 并重跑 review/QA
- Acceptance evidence: command_output, diff_summary, acceptance_report
- Deliverables: Go Git 服务、snapshot/builders、repo actions、batch actions
- Cleanliness: 禁止调试输出、TODO、注释掉代码、无用 import
