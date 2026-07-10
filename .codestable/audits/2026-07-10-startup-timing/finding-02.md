---
doc_type: audit-finding
audit: 2026-07-10-startup-timing
finding_id: bug-02
nature: bug
severity: P1
confidence: high
suggested_action: cs-refactor
status: open
---

# Finding 02：Git 代理是进程级共享状态，请求会串用配置

## 速答

每个后端接口在开始时改写同一个全局代理变量，Git 子进程真正启动时再读取该变量；请求重叠时，后一个请求可以改变前一个请求实际使用的代理。

## 关键证据

- `app.go:44-85`：快照、单仓刷新、变更操作、批量操作和日志等入口都先调用 `snapshot.SetRuntimeGitProxy(request.Proxy)`。
- `snapshot/git_proxy.go:14-22`：代理存放在包级 `runtimeGitProxy` 中；锁只避免数据竞争，不保证请求期间配置不被其他请求替换。
- `snapshot/git.go:38-46`：每个 Git 命令启动前才通过 `buildGitProcessEnv()` 读取全局代理。
- `snapshot/command_runner.go:139-142`：自定义命令也读取相同全局代理，但它的请求模型没有携带代理配置。
- `src/app/use-progressive-startup-scan.ts:88-97`：启动期默认可同时发出多个单仓请求；用户修改代理后立即刷新时，就会和仍在飞行的旧设置请求重叠。

## 影响

一次启动扫描、手动刷新、批量操作或自定义命令可以使用另一次请求的代理。表现会是网络 Git 命令偶发走错网络、失败原因与当前设置不一致，且日志很难复现。互斥锁不会修复这个问题，因为错误的是共享生命周期，而不是内存读写。

## 修复方向

删除运行时全局代理。把规范化后的代理随 `snapshot.Request` 或明确的执行选项向下传递到 `runGit` 和命令执行器，在创建每个子进程时使用该请求自己的环境。自定义命令也应明确接收调用时的代理。

## 建议动作

`cs-refactor`，因为需要把隐式全局依赖改为显式请求依赖，调用语义不应改变。
