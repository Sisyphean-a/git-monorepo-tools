# Pi Windows 终端可靠性路线

## 目的地

Windows 上运行 Pi 时，终端启动、协议协商、快捷键和文本粘贴具有明确且可验证的语义；问题能从一次可读的链路观测和确定性测试中定位，不依赖机器速度或手工猜测。

## 非目标

- 不把终端抽象成面向任意 CLI 的通用兼容层。
- 不修改 Pi、xterm、Wails 或 ConPTY 的上游实现。
- 不改变非 Windows 平台的现有键盘语义。

## 约束

- 范围限定为 Windows 上的 Pi，会话仍经现有 Wails 和 ConPTY 通道运行。
- 终端输出必须原样到达 xterm，不能为了识别协议而筛除或改写控制序列。
- 失败必须显式可见；不得以静默回退掩盖协议、剪贴板或后端写入问题。
- 保持现有按会话串行写入和仓库会话隔离契约。

## 完成判断

- 会话从创建、输出、绑定到退出的每个事件都有唯一所有者和可验证的交付语义。
- Pi 所需的 Windows 输入归一规则有单一配置位置、理由和回归测试；其余按键保持 xterm 透传。
- 受控粘贴与键盘协商的状态能够在诊断界面和自动化测试中被确认。
- 测试能稳定复现“输出或退出先于界面绑定”的时序，不依赖真实机器速度。
- 后续实现不需要再做目的地范围内的产品、协议边界或验证策略裁决。

## 覆盖面

- 会话事件生命周期 -> [会话流所有权](decisions/01-session-stream-ownership.md)
- Pi Windows 输入配置 -> [Pi 快捷键归一策略](decisions/02-pi-shortcut-profile.md)
- 启动协议与诊断状态 -> [协议状态观测](decisions/03-protocol-observability.md)
- 自动化防线 -> [时序与协议测试边界](decisions/04-deterministic-terminal-tests.md)
- 现有确定事实 -> `architecture/shared/terminal-runtime.md`：启动输出按会话缓存回放；Windows 的 `Shift+Enter` 与 `Ctrl+J` 发送 LF。

## 迄今决定

- 无。本图只记录尚待结清的路线决定。

## 打开决策项

- [会话流所有权](decisions/01-session-stream-ownership.md)
- [Pi 快捷键归一策略](decisions/02-pi-shortcut-profile.md)
- [协议状态观测](decisions/03-protocol-observability.md)
- [时序与协议测试边界](decisions/04-deterministic-terminal-tests.md)

## 迷雾

- Pi 版本升级后，是否会改变受控粘贴或增强键盘协议的协商顺序；需要先确定协议状态的观测模型，才能准确提出兼容策略问题。

## 范围外

- 通用 CLI 快捷键兼容：用户已限定为 Pi on Windows；泛化会扩大协议矩阵和测试成本。
- 浏览器自动化：项目约束禁止使用；验证以静态检查、单元测试和应用内诊断为准。
