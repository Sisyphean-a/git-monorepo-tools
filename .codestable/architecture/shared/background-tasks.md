# 后台任务运行时

- scope: workspace

## 边界

- 后台任务是应用托管的非交互进程，不是隐藏的终端、系统服务或定时任务。产品生命周期与资源取舍由 [工作区上下文](../../requirements/CONTEXT.md) 唯一定义。
- `snapshot.BackgroundTasks` 独占任务状态、进程控制和日志；`app.go` 在组合根创建管理器并在应用关闭时回收，不复用工作区级一次性命令显示权，也不创建终端会话。
- 配置保存沿用本地设置的唯一存储，不保存运行状态，也不触发 Git 扫描。旧设置缺少任务字段时得到空配置，既有项目命令保持原样。

## 运行与回收

- Windows 使用隐藏的普通 Shell 进程。Shell 以 `CREATE_SUSPENDED` 创建，在配置 kill-on-close Job 并完成归属后才恢复初始线程，避免 Shell 抢先产生未归属后代；启动任何一步失败都返回真实错误并回收已创建资源，不退回无 Job 进程。
- 停止通过自有 Job 结束整棵进程树；非 Windows 使用独立进程组。根进程自然退出也回收后代，读完 stdout/stderr 尾部后才发布结束状态，不能用根进程退出冒充整棵任务树已释放。
- 管理器在启动、停止与关闭之间串行保护任务身份；同项目同配置的重复启动返回现有活跃会话。新一轮具有新的 `runId`，旧游标不能读入新一轮日志；状态 `revision` 单调递增，前端不得以迟到的启动返回值覆盖已经到达的退出事件。停止失败保留错误与可重试状态。
- 删除配置先拒绝活跃任务，随后释放其结束会话与日志；应用关闭等待进程和输出读取收尾并清空会话。任务创建失败、未知任务和未知会话均显式报错。

## 输出成本

- stdout/stderr 必须持续排空，否则管道写满会卡住任务。日志只在后端固定容量环形缓冲中保留尾部，不落盘，不把日志放入状态事件，也不通过一次性命令事件逐块推送。
- 前端只在日志实际可见且窗口活跃时读取当前任务的增量；当前读取完成后才安排下次读取，不重叠请求。运行中读取间隔为 250ms，结束会话只读取一次最终尾部；关闭、切换任务、编辑配置、窄窗返回列表或失焦均释放日志读取调度，迟到响应不得回写。
- 后端和前端分别按字节限制日志尾部并保持 UTF-8 边界；落后游标触发显式重置与截断提示。没有新增后台轮询、日志刷新定时器或常驻 xterm 表面；仍需为每个运行任务保留管道读取与进程控制资源。

## 代码锚点

`snapshot/background_tasks.go`、`snapshot/background_task_log.go`、`snapshot/background_process_windows.go`、`snapshot/background_process_other.go`、`app.go`、`src/app/domain/background-task.ts`、`src/app/features/background-tasks/`、`src/app/components/background-tasks-modal.tsx`。
