# 架构索引

- scope: workspace

这是一个 Wails 桌面应用：Go 提供本地 Git、终端和桌面能力；React 负责编排界面与状态。

## 范围地图

| 范围 | 职责 | 代码锚点 |
| --- | --- | --- |
| Wails 入口 | 组合依赖并导出桌面绑定 | `app.go` |
| Git 工作区 | 扫描仓库、状态、变更、Git 操作、历史与差异 | `snapshot/service.go`、`snapshot/operations.go`、`snapshot/git_*.go` |
| 终端 | 按仓库管理 ConPTY 会话并批量转发输出 | `internal/terminal/manager.go`、`internal/terminal/output_batcher.go` |
| 后台任务 | 按项目托管非交互进程与有界日志，应用关闭回收 | `snapshot/background_tasks.go`、`src/app/features/background-tasks/` |
| 只读资源监控 | 应用生命周期内采样当前进程、Go 运行时与系统内存，面板打开时附带进程树明细 | `internal/monitor/`、`app.go` |
| 桌面能力 | 选目录、打开目录/终端/冲突工具 | `internal/desktop/client.go` |
| 前端领域与应用层 | 纯数据规则、页面流程和端口 | `src/app/domain/`、`src/app/application/` |
| 前端基础设施与界面 | Wails 客户端、设置存储、功能模块和组件 | `src/app/infrastructure/`、`src/app/features/`、`src/app/components/` |

## 边界

- `app.go` 只组装和转发；业务实现归入 `snapshot/`、`internal/terminal/`、`internal/desktop/` 或 `internal/monitor/`。
- 前端依赖方向是 `components/features → application → domain`；基础设施实现应用层端口，组件不直接访问 Wails。
- 跨端绑定和事件契约见 [Wails 桥接](shared/wails-bridge.md)。终端会话与事件约束见 [终端运行时](shared/terminal-runtime.md)。后台任务的进程树回收、日志游标与按需读取约束见 [后台任务运行时](shared/background-tasks.md)。读取缓存、失焦暂停与关闭回收的产品边界见 `requirements/CONTEXT.md` 的读取资源规则，`snapshot/read_resources.go` 统一拥有后端数值缓存与生命周期。
- Git 状态术语和刷新时序见 `requirements/CONTEXT.md`；高代价取舍见 `requirements/adrs/`。
- `src/app/features/files/file-browser-session.ts` 拥有文件阅读会话的目录缓存、请求去重、正文版本、按需预览和迟到响应判断；折叠目录通过 `releaseDirectory` 同时释放子树缓存与请求，失焦、离开和卸载通过 `release` 释放阅读数据并使在途读取/渲染失效。`repo-files-tab.tsx` 保留阅读位置、展开选择、界面和现有定时调度，通过同一会话入口读取，不持有内部请求编号或正文版本。后端路径安全仍由既有文件读取端口实现，渲染净化仍由 `file-renderer.ts` 实现；产品读取频率、上限和错误规则见 `requirements/CONTEXT.md`。
- 命令设置保存在本地设置中：组合与全局命令对所有仓库可见，项目命令按仓库 ID 保存，只在对应仓库的命令区域展示和执行。`src/app/features/commands/command-catalog.ts` 拥有选择、项目优先、编辑和排序规则；命令由独立弹窗管理，项目页签优先。组合、全局和项目命令均按保存的顺序展示且可调整；主界面将当前项目和全局命令合并为一个“命令”区域，并优先展示项目命令。
- 主界面的命令输出是工作区级日志：切换项目不得清空或停止正在运行命令的后续输出；后来启动的命令拥有显示权，旧命令不得覆盖；只有用户点击“清空”才重置，清空后旧命令不得重新打开输出。单次命令输出超过 256 KiB 时只保留末尾并在界面标注已截断，防止长命令无限累积。
- 设置中的“操作超时”只约束 Git 命令：超时后终止整棵进程树并使该步失败，`snapshot/process.go` 的 `waitForCommand` 是唯一终止点。自定义命令不设超时，除用户终止或应用关闭外必须跑到自然结束；运行中由界面“终止”按 streamId 杀掉整棵进程树（`snapshot/command_runner.go` 的 `commandRegistry`），命令结束后该按钮必须回到“清空”，而“清空”仍只重置显示。组合运行中终止只停止未执行的后续步骤，当前步骤不可中断并回到各自超时约束。
- 启用自动扫描且窗口可见、聚焦时，当前选中的项目立即执行本地 Git 状态刷新并每 2 秒重试，其余已发现项目每 10 秒刷新；这些高频刷新不访问远端，原自动扫描间隔继续负责远端刷新。后台单仓轮询结果若跨越了交互操作则不得回写；完整快照必须应用，`mergeSnapshotPreservingInteractions` 保留快照读取期间被交互更新的仓库结果；`workspace-snapshot-state.ts` 独占当前快照、交互回写计数与仓库版本表，并同时处理完整、交互和后台回写；`use-workspace-state.ts` 只把获准结果同步到 React、侧栏与选择。比较基准与单仓回写版本都来自该状态模块，不可拿 `snapshot-coordinator.ts` 用于丢弃旧后台结果的任务版本作比较。渐进启动扫描结束或被中断后，轮询接管仍处于“检查中”的仓库，自动扫描关闭时执行一次性补齐。单仓更新不得改写工作区扫描时间。仓库状态与阅读数据由 `mergeRepoSnapshotUpdate` 按来源合并；`snapshot/git_history.go` 拥有引用摘要读取，`Workspace` 通过阅读版本控制 `RepoHistoryTab` 的按需加载，历史刷新与阅读保留的产品规则统一见 `requirements/CONTEXT.md`。两类更新都复用语义未变的 `FileChange` 数组与对象。周期快照可以更新变更列表与计数，但不得仅因扫描时间、`RepoDetail` 或等价 `FileChange` 对象替换而重建已展开的文件差异或取消进行中的读取；只有仓库、请求设置或文件的可观察变更摘要变化时才重新读取差异。展开差异时普通路径只执行一次定向 `git diff`，不保留结果缓存；每次展开都重新读取。历史页的提交列表、选择和详情同属阅读状态，完整快照也通过同一合并规则处理；不能把基础快照省略历史数据误当成历史为空。
