---
doc_type: code-review
feature: history-tab
date: 2026-07-06
status: changes-requested
reviewer: self
---

## 结论
本轮本地 review 结论是 `changes-requested`。
当前已确认 1 个 blocking、1 个 important。未发现新的安全问题。

## Blocking
- `snapshot/git.go:230-247`
  提交详情接口把 `git show` 的输出按单行头部解析，但格式串里包含 `%b`。只要提交正文是多行，`parts := strings.Split(lines[0], "\x1f")` 就拿不到后面的父提交和 refs，直接走到“提交详情格式异常”。结果是历史列表能显示，但点到带多行正文的提交时详情面板必失败。这不是边角情况，真实仓库里很常见。

## Important
- `snapshot/service.go:173-205`、`snapshot/git.go:127-129`
  现在每次全仓库扫描都会为每个仓库额外跑一次 `rev-list --count HEAD`，即使用户根本没打开“历史” tab 也一样。这个开销被塞进了主扫描路径，和这次“历史只是一个 tab，不想做太重”的范围相反。仓库一多或历史很深时，会直接拖慢首屏扫描和自动刷新。

## Nit
- none

## Suggestion
- `src/app/components/repo-history-tab.tsx:76-97`
  “加载更多”失败时现在只会静默结束，界面没有错误提示。不是阻塞项，但后续最好给出显式反馈，不然用户只会看到按钮像没反应。

## Residual Risk
- OCR 已尝试，但本轮命令超时，未形成可采纳结果；本报告基于本地只读审查。
