# Wails 桥接

- scope: workspace

## 契约

- `app.go` 是 Go 对前端暴露桌面能力的唯一入口；其 `workspaceService`、`desktopGateway` 和 `terminalGateway` 是可替换的后端边界。
- `src/app/infrastructure/wails-client.ts` 集中校验和调用 `window.go.main.App`。前端业务代码通过 `src/app/application/ports.ts` 的端口访问，不直接碰 Wails。
- 绑定失败必须作为 rejected promise 返回，调用方展示或传播实际错误；不得把绑定缺失伪装为成功。
- 长输出使用事件：仓库终端为 `repo-terminal-output`、`repo-terminal-exit`，自定义命令为 `repo-command-output`；负载必须携带会话或流标识，避免不同仓库/命令串流。
- `frontend/wailsjs/` 由 Wails 生成，只能通过生成流程更新。

## 变更规则

新增或改动绑定时，同步检查 `app.go`、`wails-client.ts`、应用层端口和领域 DTO；如果改动事件负载，还要检查对应事件订阅和测试。

## 代码锚点

`app.go`、`src/app/infrastructure/wails-client.ts`、`src/app/application/ports.ts`、`src/app/infrastructure/wails-app-backend.ts`、`src/app/features/terminal/terminal-event-bus.ts`。
