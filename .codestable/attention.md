# 注意事项

- 范围：`workspace`。开始任务时按 `attention → architecture/INDEX → 相关 shared 页面 → requirements/CONTEXT` 加载，不遍历历史。
- 项目文档正文使用中文；当前事实以代码和本目录的架构、上下文、ADR 为准。
- Wails 是桌面运行时。`frontend/wailsjs/` 为生成文件，不手改；前端外部调用只能经 `src/app/infrastructure/wails-client.ts` 与应用层端口。
- 常用验证：`go test ./...`、`npm run typecheck`、`npm run test:snapshot-coordinator`。
