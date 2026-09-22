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
- `App.GetWorkingDiffFiles` 只重新读取当前仓库已跟踪的暂存/未暂存文件状态和行数，不扫描未跟踪文件，也不计算文件系统大小；统一差异查看器用它快速建立清单，再通过 `App.GetFileDiff` 按当前文件读取正文。
- `App.GetFileDiff` 的 `commitHash` 为空时读取当前仓库暂存或未暂存差异；非空时读取该提交相对第一父提交的差异，根提交使用空树。历史重命名文件同时传递旧路径，保证单文件差异仍保留重命名语义。已取得提交详情时前端可把 `parentHash` 一并传入，后端直接复用第一父提交，省去每个文件重复解析父提交；省略时后端回退到原有解析路径。前端仍通过同一个应用层文件差异端口调用，仓库路径与分类作为目标传递。
- `App.ListRepoDirectory` 与 `App.ReadRepoFile` 是仓库文件浏览的唯一桥接：前者只列出用户当前展开的一级目录并排除 `.git` 与符合 Git 忽略规则的项，后者只读取当前选中的一个文本文件。后端必须校验仓库标识与路径、拒绝路径穿越及指向仓库外的符号链接，并对二进制或超过 1 MiB 的文件显式返回错误；基础仓库快照不得携带文件树或正文。连续目录读取复用当前仓库唯一的 `git check-ignore --stdin` 会话，并在忽略规则、索引或仓库切换后重建，应用关闭时回收，不能为每次展开重复启动 Git 进程。
- `App.StopRepoCommand` 是终止自定义命令的唯一桥接：按 `streamId` 定位运行中的命令并杀掉整棵进程树，未知或已结束的 `streamId` 必须返回错误，不得静默成功；前端只在命令运行中把它显示为“终止”，失败时必须恢复可重试状态。
- `frontend/wailsjs/` 由 Wails 生成，只能通过生成流程更新。

## 变更规则

新增或改动绑定时，同步检查 `app.go`、`wails-client.ts`、应用层端口和领域 DTO；如果改动事件负载，还要检查对应事件订阅和测试。

## 代码锚点

`app.go`、`snapshot/file_diff.go`、`snapshot/repo_files.go`、`snapshot/repo_ignore_session.go`、`snapshot/git_history.go`、`snapshot/command_runner.go`、`internal/desktop/client.go`、`src/app/infrastructure/wails-client.ts`、`src/app/application/ports.ts`、`src/app/infrastructure/wails-app-backend.ts`、`src/app/features/diff/`、`src/app/components/diff-viewer-modal.tsx`、`src/app/components/repo-files-tab.tsx`、`src/app/features/terminal/terminal-workspace.tsx`。
