---
doc_type: feature-qa
feature: 2026-07-10-terminal-shift-enter
status: passed
tested: 2026-07-10
round: 1
---

# Shift+Enter QA 报告

## 1. Scope And Inputs

- Design：`terminal-shift-enter-design.md`
- Checklist：`terminal-shift-enter-checklist.yaml`
- Review：`terminal-shift-enter-review.md`，round 2 passed。
- Evidence pack：`terminal-shift-enter-evidence-pack.md`
- Gate results：`terminal-shift-enter-gate-results.json`
- DoD results：`terminal-shift-enter-dod-results.json`
- Diff basis：终端快捷键、输入队列、Windows PowerShell 启动配置和对应测试。
- Baseline dirty files：Ctrl+V 修复、生成快照和 `frontend/wailsjs/go/models.ts` 早于本 feature，不纳入 QA 结论。
- Feature type：functional。
- Core evidence gate：Windows 快捷键的联合事件、代理序列顺序、pwsh 与 Windows PowerShell 的真实 ConPTY 多行交互。

## 2. Verification Matrix

| ID | 来源 | 核心性 | 场景 / 风险 | 证据类型 | 命令或动作 | 期望 | 结果 |
|---|---|---|---|---|---|---|---|
| QA-001 | design S1, review REV-001 | core-functional | keydown + keypress 只发送一次代理序列 | unit | `npm run test:snapshot-coordinator` | 不放行普通回车 | pass |
| QA-002 | design S3 | core-functional | 代理序列先于后续 Enter | unit | `npm run test:snapshot-coordinator` | 写入顺序固定 | pass |
| QA-003 | design S2 | core-functional | VT 输入、显式加载和 AddLine 绑定 | Go unit | `go test ./... -count=1` | 两种 shell 使用启动配置 | pass |
| QA-004 | design S4 | core-functional | pwsh 多行输入不提前执行 | ConPTY integration | 定向 Go 测试 | Enter 后执行完整两行 | pass |
| QA-005 | design S4 | core-functional | 临时 PATH 隐藏 pwsh 的 Windows PowerShell 回退 | ConPTY integration | 定向 Go 测试 | Enter 后执行完整两行 | pass |
| QA-006 | design S1/S3 | supporting | Ctrl+C、Ctrl+V、右键和非 Windows 不回归 | unit | `npm run test:snapshot-coordinator` | 45 项全部通过 | pass |
| QA-007 | DoD commands | supporting | 类型、Go 和 Windows 生产构建 | CLI | typecheck、Go test、Wails build | exit 0 | pass |
| QA-008 | review residual risk | supporting | Wails 桌面终端可启动和渲染 | manual smoke | 启动生产构建并切换终端标签 | 显示 pwsh 提示符 | pass |

## 3. Command Results

- `npx tsc -p tsconfig.snapshot-tests.json --noEmit` → exit 0。
- `npm run test:snapshot-coordinator` → exit 0，45 项通过。
- `go test ./... -count=1` → exit 0。
- `go test . -run 'TestTerminalManagerShiftEnterAddsLineBeforeExecution' -count=1 -timeout=60s` → exit 0，包含 pwsh 与 Windows PowerShell 回退。
- `npm run wails:build` → exit 0，生成 Windows 生产构建。

## 4. Scenario Results

- [x] QA-001：keypress 被消费，不会在 keydown 之后额外发送 `\r`；联合事件测试只观察到一次代理序列。
- [x] QA-002：受控首写阻塞测试确认后续 Enter 不会越过代理序列。
- [x] QA-003：启动脚本在 PSReadLine 加载前启用 VT 输入，且使用 `-ErrorAction Stop` 注册 AddLine。
- [x] QA-004：pwsh `7.6.3 / PSReadLine 2.4.5` 中，代理后文件不存在；普通 Enter 后两条命令写入 `firstsecond`。
- [x] QA-005：Windows PowerShell `5.1.26100.8655 / PSReadLine 2.0.0` 在临时 PATH 回退后得到相同行为。
- [x] QA-006：普通 Enter、修饰组合、Ctrl+C、Ctrl+V、右键粘贴与 macOS 快捷键的单测均通过。
- [x] QA-008：生产构建桌面程序已启动，终端标签显示 pwsh 提示符。

## 5. Findings

### failed

none

### blocked

none

### residual-risk

- 当前宿主的合成按键被外层自动化输入框截获，不能直接送入 WebView2/xterm。该限制已由 Wails 桌面渲染 smoke、xterm 的 keydown/keypress 联合测试和真实 ConPTY 双 Shell 交互共同覆盖，不阻塞核心功能判断。
- Windows PowerShell 回退会优先系统 PSReadLine 模块；带自定义 profile 模块的用户环境仍值得后续桌面人工确认。

## 6. Cleanliness

- Debug output：pass。
- Temporary TODO/FIXME/XXX：pass。
- Commented-out code：pass。
- Unused imports / feature dead code：pass。
- Out-of-scope files：pass，本轮未修改既有 Ctrl+V、生成快照或 Wails 模型改动。

## 7. Verdict

- Status：passed
- Next：进入 feature acceptance。
