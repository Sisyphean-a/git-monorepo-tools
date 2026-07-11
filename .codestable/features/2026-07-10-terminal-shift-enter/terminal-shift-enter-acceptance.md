---
doc_type: feature-acceptance
feature: 2026-07-10-terminal-shift-enter
status: passed
accepted: 2026-07-10
round: 1
---

# Windows 终端 Shift+Enter 验收报告

> 阶段：验收闭环
> 关联方案：`terminal-shift-enter-design.md`

## 1. 接口契约核对

- [x] `Shift+Enter -> \x1b[1;8S -> AddLine`：快捷键模块只在 Windows 无 Ctrl、Alt、Meta 的 keydown 发送一次代理序列；后续 keypress 仅被消费。
- [x] `Enter -> \r -> AcceptLine`：普通 Enter 仍走 xterm 默认输入，快捷键测试确认它不是插入行动作。
- [x] 流程图节点：快捷键处理器、`enqueueTerminalInput`、ConPTY 和 PSReadLine AddLine 都有最终代码落点。

## 2. 行为与决策核对

- [x] Windows Shift+Enter 不执行当前命令：真实 ConPTY 测试在代理序列后确认目标文件不存在。
- [x] 普通 Enter 执行完整多行输入：真实 ConPTY 测试在 Enter 后确认两条命令写入 `firstsecond`。
- [x] 代理序列走原会话队列：前端受控顺序测试确认其先于后续 `\r`。
- [x] PSReadLine 是显式启动依赖：子进程和启动脚本均在模块加载前启用 VT 输入，并以 `-ErrorAction Stop` 加载/绑定。
- [x] Windows PowerShell 模块选择：进程启动前优先系统模块目录，避免继承 pwsh 模块而使自动交互加载失败。
- [x] 挂载点反向核对：与 Shift+Enter 相关的生产代码只在快捷键处理器、终端输入队列接通和 Windows PowerShell 启动配置内；没有新增 Wails 后端接口。
- [x] 范围守护：代码中没有为此功能写入裸 `\n` 或 PowerShell 反引号来模拟续行；非 Windows 和普通 Enter 走放行路径。

## 3. 验收场景核对

- [x] S1 Shift+Enter 续行不执行：keydown + keypress 联合测试和 pwsh / Windows PowerShell ConPTY 实测通过。
- [x] S2 Enter 执行完整两行：两个真实 shell 的 ConPTY 测试均验证 `firstsecond`。
- [x] S3 普通 Enter 保持执行：快捷键测试通过，队列测试以 `\r` 作为随后输入。
- [x] S4 Ctrl+C、Ctrl+V、右键粘贴：45 项前端回归测试通过。
- [x] S5 非 Windows 不受影响：macOS 平台 Shift+Enter 测试通过。
- [x] S6 PSReadLine 配置：Go 测试和两种 shell 的键位检查确认 VT 输入与 AddLine。
- [x] S7 队列顺序：受控 Promise 队列测试通过。
- [x] S8 pwsh 优先和 Windows PowerShell 回退：正常 PATH 与临时 PATH 隐藏 pwsh 两条真实 ConPTY 路径均通过；版本分别为 pwsh `7.6.3 / PSReadLine 2.4.5`、Windows PowerShell `5.1.26100.8655 / PSReadLine 2.0.0`。
- [x] 生产桌面构建已启动并显示 pwsh 终端提示符。
- [x] review QA focus：REV-001 的 keydown + keypress 组合只发送一次代理序列，复审和 QA 均已覆盖。
- [x] QA 报告已通过，没有 failed 或 blocked 项；DoD 的设计、实现、审查和 QA 证据均为 passed。

## 4. 术语一致性

- [x] AddLine、代理按键序列和普通 Enter 均与设计一致。
- [x] `\x1b[1;8S` 在快捷键、测试和 PowerShell 绑定中一致出现。
- [x] 没有引入与设计冲突的新用户可见术语。

## 5. 领域影响盘点

- [x] 新名词：无。术语均是本 feature 内部的终端/PSReadLine 实现细节，不需要新增 CONTEXT 或 ADR。
- [x] 结构性选择：无。未新增模块、依赖或公开接口模式。
- [x] 流程级约束：无新的跨 feature 约束；Windows PowerShell 模块路径处理仅服务当前终端启动。

## 6. Requirement Delta

- [x] 设计 frontmatter 的 `requirement` 为空，本 feature 没有关联长期 requirement，也没有 requirement delta 需要回写。

## 7. Roadmap 回写

- [x] 设计 frontmatter 的 `roadmap` 和 `roadmap_item` 均为空，非 roadmap 起头，无需回写。

## 8. Attention 候选盘点

- [x] 无候选。Windows PowerShell 模块路径问题已经由终端启动逻辑和测试固定，不需要写入全局 attention。

## 9. 遗留

- 已知限制：当前宿主的合成按键被外层自动化输入框截获，不能直接送入 WebView2/xterm；生产桌面终端启动/渲染、xterm 联合事件处理和真实 ConPTY 双 Shell 交互均已验证。
- 后续优化：`insertLine` 回调可在未来改为必填，以避免遗漏注入时静默消费快捷键；本次无阻塞影响。

## 10. 最终审计

- 验证证据来源：`terminal-shift-enter-qa.md`。
- Evidence sources：`terminal-shift-enter-evidence-pack.md`、`terminal-shift-enter-gate-results.json`、`terminal-shift-enter-dod-results.json`。
- 聚合命令：`npx tsc -p tsconfig.snapshot-tests.json --noEmit`、`npm run test:snapshot-coordinator`（45 项）、`go test ./... -count=1`、`npm run wails:build` 均 exit 0。
- 场景复核：re-verified 8 / trust-prior-verify 1。唯一 trust-prior 项是 WebView2/xterm 的合成按键投递；它不承载核心判断，核心键盘逻辑由联合事件测试和真实 ConPTY 双 Shell 交互复验。
- 交付物复核：快捷键、输入队列、Windows 启动环境、Go/前端测试、实现/审查/QA/验收报告均存在；无 schema、路由、requirement 或 roadmap 交付缺口。
- 完整工作区复核：本 feature 代码和文档均已纳入判断；既有 Ctrl+V、生成快照和 Wails 模型改动明确排除且未被修改。
- diff 清洁度：本 feature 范围内 `git diff --check` 通过；无 debug 输出、临时 TODO/FIXME、注释掉代码或无用 import。
- 知识沉淀出口：无 attention、requirement、ADR、roadmap 或指南候选。
- 结论：通过。
