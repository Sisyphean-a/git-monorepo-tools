---
doc_type: feature-acceptance
feature: 2026-07-01-wails-shell-bootstrap
status: passed
accepted: 2026-07-01
round: 1
---

# wails-shell-bootstrap 验收报告

## 1. 接口契约核对

- [x] `GetSnapshot(request)`：代码实际落点为 `app.go` → `snapshot.Service.BuildAppSnapshot`，返回结构为 `snapshot.AppSnapshot`，字段名与前端 `AppSnapshot` 对齐。
- [x] `AppSnapshot` / `RepoDetail` / `PullResult`：Go 端 `snapshot/types.go` 已与 `src/app/types.ts` 对齐。
- [x] 流程图核对：`src/app/api.ts -> App.GetSnapshot -> snapshot.Service -> git` 的链路均有实际落点。

## 2. 行为与决策核对

- [x] 只建立宿主与只读快照契约：本次只新增 `GetSnapshot`，未迁移写操作。
- [x] 首屏继续使用现有 DTO：前端未改 `AppSnapshot` 字段名，只替换 `fetchSnapshot` 的优先调用路径。
- [x] Wails 入口已显式落地：`main.go`、`wails.json`、`package.json` 的 `wails:*` 脚本、`README.md` 均存在。
- [x] 挂载点反查：宿主入口、绑定入口、命令入口均已在清单内，无额外挂入点泄漏。

## 3. 验收场景核对

- [x] 启动 `wails dev` 后可进入运行态。
  - 证据：`wails dev` 输出进入 `STATE=Running`。
- [x] `wails build` 可成功产出桌面包。
  - 证据：`build/bin/git-monorepo-tools.exe` 生成成功。
- [x] 首屏快照走 Go 绑定。
  - 证据：`src/app/api.ts` 中 `fetchSnapshot` 优先调用 `window.go.main.App.GetSnapshot`。
- [x] 范围外写操作未迁移。
  - 证据：本次未新增 mutate / batch / AI / desktop action 绑定。
- [x] QA 复核通过。
  - 证据：`wails-shell-bootstrap-qa.md` `status=passed`。

## 4. 术语一致性

- [x] `Wails 宿主`、`快照绑定`、`AppSnapshot` 在代码与 design 中命名一致。
- [x] 未引入与旧 `vite-git-api` 冲突的新名词。

## 5. 领域影响盘点

- [x] 新的长期边界候选：桌面宿主从 Vite 中间件迁向 Wails 宿主。
  - 建议：后续 roadmap 完成后可走 `cs-domain` 或 `cs-req` 固化。

## 6. requirement delta / clarification 回写

- [x] 当前仅为迁移底座，需求能力边界暂不单独回写 requirement。
- [x] 已在 roadmap 观察项中记录愿景文档仍引用 Electron + Vue，后续整体迁移完成后再统一更新。

## 7. roadmap 回写

- [x] `go-wails2-migration-items.yaml` 中 `wails-shell-bootstrap` 已从 `in-progress` 改为 `done`。
- [x] roadmap 主文档第 5 节对应条目状态已同步更新为已完成。

## 8. attention.md 候选盘点

- [x] 候选 1：本机具备 `wails v2.11.0`、`go1.26.1` 时可直接跑 `npm run wails:dev` / `npm run wails:build`。
- [x] 本轮先记录候选，不直接写入 `attention.md`。

## 9. 遗留

- 后续 feature 仍需迁移 Git 写操作、AI commit、desktop bridge 与前端 transport。
- `src/app/data.ts` 仍会在 `npm run build` 时刷新，仅作为静态初始快照，不代表 Wails 运行态真实数据来源。

## 10. 最终审计

- `go build ./...`：passed
- `npm run build`：passed
- `wails build`：passed
- `wails dev`：passed（运行态拉起）
- 交付物复核：`main.go`、`app.go`、`snapshot/`、`wails.json`、`README.md`、`package.json`、`src/app/api.ts`、`src/vite-env.d.ts` 全部落盘。
- 清洁度复核：无 debug 输出、TODO、注释掉代码、无用 import。
- 结论：本 feature 满足 approved design 的首屏宿主与只读快照目标，可进入下一个 roadmap item。
