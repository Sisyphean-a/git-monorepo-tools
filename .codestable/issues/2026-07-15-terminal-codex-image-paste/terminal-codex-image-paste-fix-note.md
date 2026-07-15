---
doc_type: issue-fix
issue: 2026-07-15-terminal-codex-image-paste
path: fast-track
fix_date: 2026-07-15
tags: [terminal, paste, clipboard, codex, windows]
---

# 终端 Codex 图片粘贴修复记录

## 1. 问题描述

Windows 桌面端的仓库终端中启动 Codex 后，使用 Ctrl+V 粘贴系统剪贴板里的图片会失败；相同操作在 Windows Terminal 中正常。

## 2. 根因

仓库终端为兼容 Windows 文本粘贴而拦截 Ctrl+V，并阻止浏览器默认处理。该路径只读取剪贴板文本；图片剪贴板没有 Unicode 文本格式时，Wails 会返回空文本或拒绝读取，原始 Ctrl+V 也没有进入 PTY，导致 Codex 收不到自己的图片粘贴快捷键。

## 3. 修复方案

保留现有文本粘贴行为。粘贴 helper 根据明确的来源类型决定行为：键盘 Ctrl+V 读取到空文本或文本读取失败时，向 PTY 写入 Ctrl+V 控制字符，让 Codex 自行读取系统图片剪贴板；右键粘贴不启用该回退，避免空剪贴板时向普通 shell 注入按键，并保留原有读取错误。

## 4. 改动文件清单

- `src/app/components/repo-terminal-shortcuts.ts`
- `src/app/components/repo-terminal-shortcuts.test.ts`
- `src/app/components/repo-terminal-surface.tsx`
- `.tmp/snapshot-tests/components/repo-terminal-shortcuts.js`
- `.tmp/snapshot-tests/components/repo-terminal-shortcuts.test.js`

## 5. 验证结果

- `npm run typecheck`：通过。
- `npm run test:snapshot-coordinator`：58 项测试全部通过。
- `go test ./...`：通过，命令在 60 秒硬超时内完成。
- `npm run wails:build`：Windows 生产构建通过。
- `git diff --check`：通过，仅输出仓库既有的 LF/CRLF 转换提示。
- 新增测试确认：空文本或文本读取失败时，键盘粘贴会写入 Ctrl+V；未配置回退的右键粘贴仍保持空文本无操作、读取失败显式抛出。

## 6. 遗留事项

自动化测试无法向真实 Wails WebView 注入 Windows 系统图片剪贴板，仍需在桌面程序中启动 Codex 后手工粘贴一张图片，确认 Codex 显示图片附件。
