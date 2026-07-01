# frontend-transport-cutover goal spec

- Roadmap item: `frontend-transport-cutover`
- Design: `.codestable/features/2026-07-01-frontend-transport-cutover/frontend-transport-cutover-design.md`
- Checklist: `.codestable/features/2026-07-01-frontend-transport-cutover/frontend-transport-cutover-checklist.yaml`
- Design review: `.codestable/features/2026-07-01-frontend-transport-cutover/frontend-transport-cutover-design-review.md`
- Review: `.codestable/features/2026-07-01-frontend-transport-cutover/frontend-transport-cutover-review.md`
- QA: `.codestable/features/2026-07-01-frontend-transport-cutover/frontend-transport-cutover-qa.md`
- Acceptance: `.codestable/features/2026-07-01-frontend-transport-cutover/frontend-transport-cutover-acceptance.md`
- Depends on: `git-operation-parity`, `desktop-bridge-parity`, `ai-commit-parity`
- Feature type: mixed
- Core runtime path: `wails dev` 下所有前端交互通过绑定运行，无 `/api/*` 依赖
- Mandatory commands: `wails dev`
- Feature DoD: 前端传输层完成切换，关键交互稳定，错误继续抛异常
- Stage gates: implementation.before_review, review.before_pass, qa.before_acceptance, acceptance.before_done
- Gate inputs: design, checklist, diff, search evidence, screenshots
- Failure recovery: 调用残留或语义漂移回 impl；review blocking 回 review-fix；QA failed 回 qa-fix 并重跑 review/QA
- Acceptance evidence: diff_summary, screenshot, acceptance_report
- Deliverables: 更新后的 `src/app/api.ts` 与相关调用点
- Cleanliness: 禁止调试输出、TODO、注释掉代码、无用 import
