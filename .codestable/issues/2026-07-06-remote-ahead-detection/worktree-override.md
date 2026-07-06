reason: 当前仓库未运行在 linked execution worktree 中，但用户明确要求直接修复“启动时为检测远端提交而长时间卡在扫描页，远端检查应挪到进页面后后台执行”的现存 bug。
scope: 仅修改 `snapshot/` 下仓库扫描与测试、`src/app/` 下快照请求与刷新调度、`scripts/sync-real-data.mjs` 镜像实现，以及本 issue 对应文档。
approval: 用户在 2026-07-06 的对话中先确认远端检测修复方案，随后明确提出“这个操作能在进入页面之后再进行吗”，授权继续按该方向修复首屏阻塞问题。
