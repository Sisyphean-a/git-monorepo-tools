# Wails 桥接

- scope: workspace

## 契约

- `app.go` 是 Go 对前端暴露桌面能力的唯一入口；其 `workspaceService`、`desktopGateway` 和 `terminalGateway` 是可替换的后端边界。
- `src/app/infrastructure/wails-client.ts` 集中校验和调用 `window.go.main.App`。前端业务代码通过 `src/app/application/ports.ts` 的端口访问，不直接碰 Wails。
- 仓库快照请求必须同时传递扫描根目录和已忽略项目路径，后端据此决定参与发现和扫描的仓库。
- 绑定失败必须作为 rejected promise 返回，调用方展示或传播实际错误；不得把绑定缺失伪装为成功。
- Windows 终端剪贴板经专用绑定读取：`App.ReadClipboardImagePath` 通过 STA 读取器返回临时 PNG 路径，`App.ReadClipboardText` 通过原生 Win32 文本格式返回字符串。前端只能通过运行时端口取得这些值，不能依赖 WebView 的 `navigator.clipboard`、浏览器 `paste` 事件或 Wails runtime `ClipboardGetText`，这些路径在桌面 WebView 中可能不派发或永久不返回。Wails 会把 Go 错误以字符串或对象形式拒绝，前端诊断必须保留非 `Error` 错误详情。
- `App.OpenLocalPath` 是前端请求系统默认程序打开本地文件或目录的唯一桥接：桌面层必须拒绝空值、相对路径和不存在目标，并以参数化进程调用执行，不能经 shell 拼接目标文本。
- 长输出使用事件：仓库终端为 `repo-terminal-output`、`repo-terminal-exit`，自定义命令为 `repo-command-output`；负载必须携带会话或流标识，避免不同仓库/命令串流。新增终端标签通过 `CreateTerminalSession` 创建独立会话，关闭时通过 `CloseTerminalSession` 显式终止。
- `RepoHistoryPage` 的提交摘要包含父提交哈希，供前端在不额外请求提交详情的前提下绘制历史拓扑。
- `frontend/wailsjs/` 由 Wails 生成，只能通过生成流程更新。

## 变更规则

新增或改动绑定时，同步检查 `app.go`、`wails-client.ts`、应用层端口和领域 DTO；如果改动事件负载，还要检查对应事件订阅和测试。

## 代码锚点

`app.go`、`internal/desktop/client.go`、`src/app/infrastructure/wails-client.ts`、`src/app/application/ports.ts`、`src/app/infrastructure/wails-app-backend.ts`、`src/app/features/terminal/terminal-workspace.tsx`。
