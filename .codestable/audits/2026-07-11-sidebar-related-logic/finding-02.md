---
doc_type: audit-finding
audit: 2026-07-11-sidebar-related-logic
finding_id: "bug-02"
nature: bug
severity: P1
confidence: medium
suggested_action: cs-issue
status: resolved
---

# Finding 02：添加目录失败形成未处理 Promise

## 速答

侧边栏“添加目录”入口丢弃异步调用返回值，而处理函数没有捕获目录选择器异常；系统对话框失败时会产生未处理 rejection，界面也没有错误反馈。

## 关键证据

- `src/app/App.tsx:131` — `handleAddScanRoot` 在 `await pickFolder()` 外没有 `try/catch`。
- `src/app/App.tsx:305` — 侧边栏菜单通过 `void handleAddScanRoot()` 显式丢弃 Promise，调用方无法处理失败。
- `desktop.go:16` — 原生目录对话框确实存在返回 error 的路径，不是纯理论异常。

## 影响

当 Wails 原生目录对话框初始化或调用失败时，用户点击后无可见反馈，并在运行时留下未处理 Promise rejection。触发依赖桌面环境异常，因此置信度为 medium。

## 修复方向

在 `handleAddScanRoot` 的交互边界捕获异常并写入现有可见错误状态，不在 JSX 调用点吞掉 rejection。

## 建议动作

`cs-issue`，因为这是明确的异常路径行为缺陷。
