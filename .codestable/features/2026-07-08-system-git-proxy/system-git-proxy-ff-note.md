---
doc_type: feature-ff-note
feature: system-git-proxy
date: 2026-07-08
requirement:
tags: [git, proxy, settings, wails]
---

## 做了什么
给 Git 行为设置增加了手动代理配置，默认关闭，默认地址是 `127.0.0.1:7897`。
开启后，应用内置的 Git 刷新、Pull、Push 和仓库命令会带上代理环境去连 GitHub。

## 改了哪些
- `src/app/types.ts`、`src/app/settings.ts`、`src/app/components/git-behavior-settings-tab.tsx` — 增加代理设置结构、默认值、清洗逻辑和设置页表单。
- `src/app/api.ts`、`snapshot/types.go`、`app.go` — 把代理配置从前端设置带到后端请求，并在每次 Git 请求前更新运行时代理。
- `snapshot/git_proxy.go`、`snapshot/git.go`、`snapshot/command_runner.go` — 给内置 Git 子进程和仓库命令统一注入代理环境变量。
- `src/app/*.test.ts`、`snapshot/git_proxy_test.go`、`package.json`、`tsconfig.snapshot-tests.json` — 补代理相关前后端测试并接入现有测试入口。

## 怎么验证的
运行 `go test ./snapshot` 通过。
运行 `npm run test:snapshot-coordinator` 通过。

## 顺手发现（可选，不阻塞）
- `src/app/settings.ts`、`src/app/command-center.ts` 之前没进这套严格前端测试，补进来后顺手修了 ESM 后缀和类型问题。
