# wails-shell-bootstrap goal spec

- Roadmap item: `wails-shell-bootstrap`
- Design: `.codestable/features/2026-07-01-wails-shell-bootstrap/wails-shell-bootstrap-design.md`
- Checklist: `.codestable/features/2026-07-01-wails-shell-bootstrap/wails-shell-bootstrap-checklist.yaml`
- Design review: `.codestable/features/2026-07-01-wails-shell-bootstrap/wails-shell-bootstrap-design-review.md`
- Review: `.codestable/features/2026-07-01-wails-shell-bootstrap/wails-shell-bootstrap-review.md`
- QA: `.codestable/features/2026-07-01-wails-shell-bootstrap/wails-shell-bootstrap-qa.md`
- Acceptance: `.codestable/features/2026-07-01-wails-shell-bootstrap/wails-shell-bootstrap-acceptance.md`
- Depends on: none
- Feature type: mixed
- Core runtime path: `wails dev` 启动窗口并通过 Go 绑定返回真实快照
- Mandatory commands: `wails dev`
- Feature DoD: 宿主可启动、快照链路真实、review/QA/acceptance 全通过
- Stage gates: implementation.before_review, review.before_pass, qa.before_acceptance, acceptance.before_done
- Gate inputs: design, checklist, diff, command evidence, screenshots
- Failure recovery: 宿主或 DTO 问题回 impl；review blocking 回 review-fix；QA failed 回 qa-fix 并重跑 review/QA
- Acceptance evidence: command_output, screenshot
- Deliverables: Wails 工程骨架、Go 绑定入口、首屏快照接线
- Cleanliness: 禁止调试输出、TODO、注释掉代码、无用 import
