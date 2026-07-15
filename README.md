# Git Monorepo Tools

这是一个 Wails 桌面应用。Go 负责仓库扫描、Git 操作、终端和系统能力，React 负责界面与交互编排。

## 架构

后端依赖方向：`app.go` 只负责把 Wails 和各模块接起来，业务能力分别放在：

- `snapshot/`：仓库扫描、Git 状态、历史与变更详情。
- `internal/terminal/`：终端会话、输出批处理与进程管理。
- `internal/desktop/`：目录选择、打开目录、终端和冲突工具等系统能力。

前端依赖方向：组件 -> 应用层 -> 领域层；外部调用通过应用层定义的接口注入。

- `src/app/domain/`：纯业务类型和数据转换，不依赖 React、Wails。
- `src/app/application/`：页面状态和业务流程，只依赖接口，不直接调用 Wails。
- `src/app/infrastructure/`：Wails 调用和本地设置存储，是外部能力的具体实现。
- `src/app/features/`：命令、终端等可独立演进的功能模块。
- `src/app/components/`：展示与交互组件；`App.tsx` 只组装各层。

新增能力时，先把业务规则放进 `domain`，再由 `application` 编排；只有访问系统或存储时才修改 `infrastructure`。后端按能力归入现有模块，避免继续向根目录增加实现文件。

## 开发

- Wails 桌面开发：`npm run dev`
- Web 预览：`npm run web:dev`

## 构建

- Wails 桌面构建：`npm run build`
- Web 构建：`npm run web:build`
