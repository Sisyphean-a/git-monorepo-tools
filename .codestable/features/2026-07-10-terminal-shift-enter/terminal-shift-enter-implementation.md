---
doc_type: feature-implementation
feature: 2026-07-10-terminal-shift-enter
status: completed
implemented: 2026-07-10
---

# Shift+Enter 实现记录

## 改动范围

- 终端快捷键新增仅限 Windows 的 `Shift+Enter` 插入行动作，拦截后发送 `\x1b[1;8S`，普通 Enter 与带 Ctrl、Alt、Meta 的组合保持放行。
- 代理序列复用当前会话的输入队列，测试确认它在后续 `\r` 之前写入。
- PowerShell 启动时显式启用 VT 输入、强制加载 PSReadLine，并将代理键绑定到原生 `AddLine`。
- PowerShell 子进程在启动前设置 VT 标志；Windows PowerShell 同时使用自身标准模块目录，避免继承 pwsh 的不兼容 PSReadLine 模块。

## TDD 证据

### 步骤 1：快捷键动作

- RED：Windows `Shift+Enter` 初始返回 `pass-through`；处理器初始放行默认 Enter；Ctrl、Alt、Meta 三种修饰组合初始错误触发插入行动作。
- GREEN：新增 `insert-line` 动作、消费处理器和修饰键限制。
- VERIFY：专项 TypeScript 编译与 12 项终端快捷键测试通过。

### 步骤 2：PowerShell 编排

- RED：启动脚本没有 VT 输入、显式 PSReadLine 加载或 AddLine 绑定；随后发现 Windows PowerShell 子进程会继承 pwsh 的模块搜索路径。
- GREEN：启动脚本在模块加载前设定 VT 输入，并以 `-ErrorAction Stop` 加载/绑定；子进程环境优先 Windows PowerShell 标准模块路径。
- VERIFY：Go 启动配置测试通过。pwsh `7.6.3 / PSReadLine 2.4.5` 与 Windows PowerShell `5.1.26100.8655 / PSReadLine 2.0.0` 都确认 VT 值为 `1`、键位为 `AddLine`。

### 步骤 3：输入接通

- RED：输入队列没有可测试的顺序入口；快捷键回调未携带代理序列。
- GREEN：新增队列辅助函数，快捷键回调发送固定代理序列，终端界面通过原有会话队列写入。
- VERIFY：受控首写阻塞测试确认代理序列先于后续 Enter；43 项前端测试通过。

### 步骤 4：Windows 实机交互

- TDD exception：这是对已实现行为的真实 ConPTY/桌面验收，不新增生产行为。
- 替代证据：真实 ConPTY 会话先写两条文件命令和代理序列，代理后文件不存在；写入普通 Enter 后文件内容为 `firstsecond`。正常 PATH 覆盖 pwsh；临时 PATH 隐藏 pwsh 后覆盖 Windows PowerShell。
- 桌面构建产物已正常启动并渲染 pwsh 终端。当前宿主的合成按键被外层自动化输入框截获，无法投递到 WebView2/xterm；此限制不影响已完成的真实 ConPTY 双 Shell 验收。

## 验证与清洁度

- 基线预检：`npx tsc -p tsconfig.snapshot-tests.json --noEmit`、`npm run test:snapshot-coordinator`，35 项测试通过。
- 最终验证：TypeScript 检查通过；前端 43 项测试通过；`go test ./...` 通过；`npm run wails:build` 通过。
- 清洁度：本 feature 新增代码无调试输出、TODO、注释掉代码或无用 import；`git diff --check` 在本 feature 文件范围内通过。

## 范围与交付

- 新增：快捷键动作、代理按键序列、队列顺序验证、PowerShell 启动配置和双 Shell ConPTY 验证。
- 未新增 Wails 后端接口，未通过裸换行或反引号模拟 AddLine，未改变非 Windows 快捷键。
- 当前检出原有的 Ctrl+V 修复及其生成测试文件在本 feature 启动前已存在，已保留且未回退；本 feature 仅在同一终端模块上增量修改。

## 验收自检

- Shift+Enter 不执行、Enter 执行多行：真实 pwsh 与 Windows PowerShell ConPTY 测试通过。
- 普通 Enter、Ctrl+C、Ctrl+V、右键粘贴和非 Windows 快捷键：前端回归测试覆盖，既有测试通过。
- PSReadLine 显式失败、VT 输入和 AddLine：Go 配置测试及两种实际 shell 键位检查通过。
- 队列顺序：前端受控顺序测试通过。

## Review-Fix REV-001

- RED：模拟 xterm 的 `keydown + keypress` 时，后续 `keypress` 初始返回放行，测试失败。
- GREEN：同一 Windows Shift+Enter 的 `keypress` 现在仅消费默认事件，不重复发送代理序列。
- VERIFY：专项终端快捷键测试 15 项通过；全量前端测试 45 项通过，Go 测试和 Wails 生产构建通过。
