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
