# desktop-bridge-parity goal spec

- Roadmap item: `desktop-bridge-parity`
- Design: `.codestable/features/2026-07-01-desktop-bridge-parity/desktop-bridge-parity-design.md`
- Checklist: `.codestable/features/2026-07-01-desktop-bridge-parity/desktop-bridge-parity-checklist.yaml`
- Design review: `.codestable/features/2026-07-01-desktop-bridge-parity/desktop-bridge-parity-design-review.md`
- Review: `.codestable/features/2026-07-01-desktop-bridge-parity/desktop-bridge-parity-review.md`
- QA: `.codestable/features/2026-07-01-desktop-bridge-parity/desktop-bridge-parity-qa.md`
- Acceptance: `.codestable/features/2026-07-01-desktop-bridge-parity/desktop-bridge-parity-acceptance.md`
- Depends on: `wails-shell-bootstrap`
- Feature type: functional
- Core runtime path: `wails dev` 下触发目录选择、打开文件夹、打开终端、打开冲突工具
- Mandatory commands: `wails dev`
- Feature DoD: Windows 等价桥接恢复可用，空路径显式失败
- Stage gates: implementation.before_review, review.before_pass, qa.before_acceptance, acceptance.before_done
- Gate inputs: design, checklist, screenshot evidence, diff
- Failure recovery: 桥接失败回 impl；review blocking 回 review-fix；QA failed 回 qa-fix 并重跑 review/QA
- Acceptance evidence: screenshot, command_output, acceptance_report
- Deliverables: Go/Wails 桌面桥接绑定
- Cleanliness: 禁止调试输出、TODO、注释掉代码、无用 import
