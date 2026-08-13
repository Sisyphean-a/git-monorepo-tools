# 架构索引

- scope: workspace

这是一个 Wails 桌面应用：Go 提供本地 Git、终端和桌面能力；React 负责编排界面与状态。

## 范围地图

| 范围 | 职责 | 代码锚点 |
| --- | --- | --- |
| Wails 入口 | 组合依赖并导出桌面绑定 | `app.go` |
| Git 工作区 | 扫描仓库、状态、变更、Git 操作、历史与差异 | `snapshot/service.go`、`snapshot/operations.go`、`snapshot/git_*.go` |
| 终端 | 按仓库管理 ConPTY 会话并批量转发输出 | `internal/terminal/manager.go`、`internal/terminal/output_batcher.go` |
| 桌面能力 | 选目录、打开目录/终端/冲突工具 | `internal/desktop/client.go` |
| 前端领域与应用层 | 纯数据规则、页面流程和端口 | `src/app/domain/`、`src/app/application/` |
| 前端基础设施与界面 | Wails 客户端、设置存储、功能模块和组件 | `src/app/infrastructure/`、`src/app/features/`、`src/app/components/` |

## 边界

- `app.go` 只组装和转发；业务实现归入 `snapshot/`、`internal/terminal/` 或 `internal/desktop/`。
- 前端依赖方向是 `components/features → application → domain`；基础设施实现应用层端口，组件不直接访问 Wails。
- 跨端绑定和事件契约见 [Wails 桥接](shared/wails-bridge.md)。终端会话与事件约束见 [终端运行时](shared/terminal-runtime.md)。
- Git 状态术语和刷新时序见 `requirements/CONTEXT.md`；高代价取舍见 `requirements/adrs/`。
- 命令设置保存在本地设置中：组合与全局命令对所有仓库可见，项目命令按仓库 ID 保存，只在对应仓库的命令区域展示和执行。`src/app/features/commands/command-catalog.ts` 拥有选择、项目优先、编辑和排序规则；命令由独立弹窗管理，项目页签优先。组合、全局和项目命令均按保存的顺序展示且可调整；主界面将当前项目和全局命令合并为一个“命令”区域，并优先展示项目命令。
- 主界面的命令输出是工作区级日志：切换项目不得清空或停止正在运行命令的后续输出；后来启动的命令拥有显示权，旧命令不得覆盖；只有用户点击“清空”才重置，清空后旧命令不得重新打开输出。
- 启用自动扫描时，当前选中的项目立即执行本地 Git 状态刷新并每 2 秒重试，其余已发现项目每 10 秒刷新；这些高频刷新不访问远端，原自动扫描间隔继续负责远端刷新。后台结果若跨越了交互操作则不得回写。周期快照可以更新变更列表与计数，但不得仅因扫描时间、`RepoDetail` 或等价 `FileChange` 对象替换而重建已展开的文件差异或取消进行中的读取；只有仓库、请求设置或文件的可观察变更摘要变化时才失效对应差异缓存。打开差异时复用快照已确认的文件状态，普通路径只执行一次定向 `git diff`；不得为每次点击重复扫描该文件状态。
