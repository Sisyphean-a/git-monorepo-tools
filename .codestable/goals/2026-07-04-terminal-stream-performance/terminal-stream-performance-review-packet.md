# CodeStable Code Quality Review Packet

- root: `E:/github/git-monorepo-tools`
- unit: `.codestable/goals/2026-07-04-terminal-stream-performance`
- stage: `quality`

## Reviewer Mission

Check whether the code is clean, tested, maintainable, secure, and robust under real project conditions.

## Stage Focus

maintainability, readability, coupling, security, edge cases, test gaps, performance, idempotency, crash-resume behavior, and deterministic boundaries

## Reviewer Output Contract

- Lead with findings, ordered by severity.
- Include severity (`P0`/`P1`/`P2`/`P3`) and confidence for each finding.
- Reference concrete files, code, docs, or validation evidence when possible.
- If there are no blocking findings, say so explicitly and list residual risks or test gaps.

## Unit Documents
### `.codestable/goals/2026-07-04-terminal-stream-performance/approval-report.md`

```
---
doc_type: approval-report
unit: .codestable/goals/2026-07-04-terminal-stream-performance
status: pending
reason: review-authorization
created_at: 2026-07-04
---

# Approval Report

## Decision Needed

是否授权 CodeStable 对本 goal 启动 Task agent，执行：

- 独立 implementation review
- 独立功能验收

## Why Now

按 `.codestable/reference/execution-conventions.md`，实现完成后必须经过独立 review；按 `cs-goal`，标记 `complete` 前必须有 Task agent 功能验收。当前代码和本地验证已经完成，下一步就是这个终端 gate。

## Context

本轮优化只覆盖仓库终端 Tab，owner 已明确：

- 交互优先
- 不扩展到其他输出 UI
- 完成证据用“真实场景 + 可复现压测”双证据

当前已完成的实现：

- 后端新增 `terminalOutputBatcher`，按 `16ms` 和 `64KB` 策略合并 PTY 高频输出，减少 Wails 事件风暴。
- 前端新增 `TerminalOutputWriter`，把终端输出改成逐帧分批写入 xterm，而不是逐事件立刻 `write()`。
- 终端 `scrollback` 从 `8000` 收紧到 `2000`，优先把资源让给交互流畅性。
- 压测与验证已补齐。

最近一轮额外优化：

- 后端 batcher 的 pending 容器从字符串数组换成 `bytes.Buffer`，减少 join 分配。
- 前端 writer 去掉 `shift()` 热点，改成游标式消费与按需压缩。

当前证据：

- `go test ./...`：passed
- `go test -run TestTerminalOutputBatcher -count=1`：passed
- `go test -run TestTerminalManagerHighVolumeOutputBatchesEvents -count=1`：passed
- `go test -bench BenchmarkTerminalOutputBatcherBurst -benchmem -run ^$`：passed
  - `40156 ns/op`
  - `196817 B/op`
  - `16 allocs/op`
- `npm run test:snapshot-coordinator`：passed（18/18）
- `npm run web:build`：passed
- `npm run build`：passed（Wails build）
- 真实 PTY 压测：`5000` 行 PowerShell 输出，事件数断言 `< 512`
- 前端 writer 压测：`5000` 次 `enqueue`，最终写入次数断言 `< 20`

## Options

1. Task agent review + acceptance（推荐）
2. 暂不授权，goal 保持 `active`

## Recommendation

选择选项 1。当前实现收益和本地证据已经齐备，最合理的下一步是让独立 Task agent 只读审查 diff，并按 owner 的 done signal 做终端功能验收。

## Risks And Tradeoffs

- 若不做独立 review，可能遗漏高频输出下的边角行为回归，例如输出顺序、退出尾消息时序、隐藏 Tab 恢复后的刷写节奏。
- 若不做功能验收，当前只能证明“本地压测和构建通过”，不能按 goal 规则证明“实际终端体验满足 owner 预期”。

## Non-Automatic Actions

- 这不会自动 commit、merge、push、deploy。
- 即使你授权 Task agent，review finding 也不会被自动接受；我仍会核对并决定是否需要继续修正。

## After You Answer

- 若授权：我启动独立 Task agent review 与功能验收，完成后立即关闭不再使用的子代理，再根据结果决定是否关闭 goal。
- 若不授权：goal 保持 `active`，等待后续决策。
```

### `.codestable/goals/2026-07-04-terminal-stream-performance/goal.md`

```
---
doc_type: goal
goal: terminal-stream-performance
status: active
---

# 终端高频输出性能优化

## Objective

优化仓库终端 Tab 在高频海量输出场景下的性能，重点处理 `codex`、`claude` 这类持续刷屏 CLI，让终端在长时间高速输出时仍保持交互流畅、资源占用低且行为稳定。

## Starting Point

当前终端输出链路是“后端读到一块就发一块事件，前端收到一条就立刻写一条 xterm”。这种逐事件直通模式在普通命令下可用，但面对 agent 类 CLI 的持续高频输出时，容易把性能消耗堆到事件频率和渲染次数上。

## Acceptance Criteria

- 在真实高频 CLI 持续输出场景下，终端输入、滚动和切换 Tab 仍保持稳定，不出现明显卡顿或失去响应。
- 终端输出链路具备明确的批量 / 裁剪 / 节流策略，资源占用明显低于逐事件立刻渲染的现状。
- 提供一个可复现的本地压测或基准，能证明高频输出下的性能改善方向和稳定性。
- 完成代码验证与独立功能验收。

## Non-Goals

- 不扩展到右侧命令输出面板或其他流式文本区域。
- 不改变终端的基本交互语义，例如 Ctrl+C、方向键、彩色输出、resize。
- 不新增终端设置页或复杂性能调参 UI。

## Decisions And Assumptions

- owner 已明确选择：交互优先，而不是历史优先。
- 优化范围只限终端 Tab，不碰其他输出 UI。
- 完成证据采用“双证据”：真实高频 CLI 场景 + 可复现本地压测。
- 历史保留可以为性能让路，只要不破坏终端基本可用性。

## Current State

后端输出批量合并、前端逐帧分批写入、scrollback 收敛和压力测试已完成，本地验证全部通过。近期又把后端 batcher 和前端 writer 的热路径进一步压缩，benchmark 和真实 PTY 压测都比首版更稳。当前只剩 CodeStable 终端 gate：等待 owner 决定是否授权 Task agent 做独立 review 与功能验收。

## Next Action

等待 owner 决定是否授权 Task agent 执行独立 review 与功能验收。
```

### `.codestable/goals/2026-07-04-terminal-stream-performance/state.yaml`

```
schema_version: 1
goal: "terminal-stream-performance"
status: active
objective: "优化仓库终端 Tab 在高频海量输出场景下的性能，重点处理 codex / claude 这类持续刷屏 CLI，达到交互优先、资源占用低、性能稳定，并用真实场景与可复现压测给出完成证据。"
start_point: "当前终端 Tab 对每个 Wails 输出事件都会立刻写入 xterm.js，后端也按读取到的 chunk 逐次 EventsEmit；在 codex / claude 这类高频流式输出场景下，容易因为事件过密和渲染过频导致卡顿、CPU 升高和资源占用膨胀。"
acceptance:
  - "在真实高频 CLI 持续输出场景下，终端输入、滚动和切换 Tab 仍保持稳定，不出现明显卡顿或失去响应。"
  - "终端输出链路具备明确的批量/裁剪/节流策略，资源占用明显低于逐事件立刻渲染的现状。"
  - "提供一个可复现的本地压测或基准，能证明高频输出下的性能改善方向和稳定性。"
  - "完成代码验证与独立功能验收。"
non_goals:
  - "不扩展到右侧命令输出面板或其他流式文本区域。"
  - "不改变终端的基本交互语义，例如 Ctrl+C、方向键、彩色输出、resize。"
  - "不新增终端设置页或复杂性能调参 UI。"
budget:
  kind: none
  limit: null
current_iteration: 2
next_action: "等待 owner 决定是否授权 Task agent 执行独立 review 与功能验收；若授权，则继续终端 gate 并准备 goal 收尾。"
blocker_signature: null
blocker_count: 0
owner_stop: null
updated_at: "2026-07-04"
```

## Git Diff Stat

```
### unstaged
package.json                                 |  2 +-
 src/app/components/repo-terminal-surface.tsx | 59 +++++++++++++++++++---------
 terminal_manager.go                          |  8 ++--
 terminal_manager_windows_test.go             | 58 +++++++++++++++++++++++++++
 terminal_types.go                            | 12 ++++--
 tsconfig.snapshot-tests.json                 |  4 ++
 6 files changed, 115 insertions(+), 28 deletions(-)

### staged
No staged diff.
```

## Focused Diff

### Unstaged

```diff
diff --git a/package.json b/package.json
index aaaef42..ec2c614 100644
--- a/package.json
+++ b/package.json
@@ -9,7 +9,7 @@
     "web:dev": "vite",
     "web:build": "vite build",
     "preview": "vite preview",
-    "test:snapshot-coordinator": "tsc -p tsconfig.snapshot-tests.json && node --test .tmp/snapshot-tests/snapshot-coordinator.test.js .tmp/snapshot-tests/api.test.js .tmp/snapshot-tests/repo-status.test.js .tmp/snapshot-tests/repo-log.test.js .tmp/snapshot-tests/pull-results.test.js",
+    "test:snapshot-coordinator": "tsc -p tsconfig.snapshot-tests.json && node --test .tmp/snapshot-tests/snapshot-coordinator.test.js .tmp/snapshot-tests/api.test.js .tmp/snapshot-tests/repo-status.test.js .tmp/snapshot-tests/repo-log.test.js .tmp/snapshot-tests/pull-results.test.js .tmp/snapshot-tests/terminal-event-bus.test.js .tmp/snapshot-tests/terminal-output-writer.test.js",
     "wails:dev": "wails dev",
     "wails:build": "wails build"
   },
diff --git a/src/app/components/repo-terminal-surface.tsx b/src/app/components/repo-terminal-surface.tsx
index 5595b8e..7abcd67 100644
--- a/src/app/components/repo-terminal-surface.tsx
+++ b/src/app/components/repo-terminal-surface.tsx
@@ -2,14 +2,12 @@ import { useEffect, useRef, useState } from 'react';
 import { Terminal } from '@xterm/xterm';
 import { FitAddon } from '@xterm/addon-fit';
 import '@xterm/xterm/css/xterm.css';
-import { EventsOn } from '../../../frontend/wailsjs/runtime/runtime';
 import { ensureTerminalSession, resizeTerminal, writeTerminalInput } from '../api';
+import { terminalEventBus } from '../terminal-runtime-event-bus';
+import { TerminalOutputWriter } from '../terminal-output-writer';
 import { C } from '../theme';
 import type { RepoDetail, TerminalSessionInfo } from '../types';
 
-const TERMINAL_OUTPUT_EVENT = 'repo-terminal-output';
-const TERMINAL_EXIT_EVENT = 'repo-terminal-exit';
-
 type TerminalStatus = 'idle' | 'connecting' | 'running' | 'failed' | 'exited';
 
 export function RepoTerminalSurface({ repo, active }: { repo: RepoDetail; active: boolean }) {
@@ -18,6 +16,9 @@ export function RepoTerminalSurface({ repo, active }: { repo: RepoDetail; active
   const terminalRef = useRef<Terminal | null>(null);
   const fitAddonRef = useRef<FitAddon | null>(null);
   const sessionRef = useRef<TerminalSessionInfo | null>(null);
+  const [sessionId, setSessionId] = useState<string | null>(null);
+  const sessionBindingRef = useRef<{ bindSession: (sessionId: string) => void; dispose: () => void } | null>(null);
+  const outputWriterRef = useRef<TerminalOutputWriter | null>(null);
   const inputQueueRef = useRef(Promise.resolve());
   const resizeFrameRef = useRef<number | null>(null);
 
@@ -51,6 +52,7 @@ export function RepoTerminalSurface({ repo, active }: { repo: RepoDetail; active
     if (!terminal || !fitAddon) return;
 
     if (resetTerminal) {
+      outputWriterRef.current?.reset();
       terminal.reset();
     }
 
@@ -63,6 +65,8 @@ export function RepoTerminalSurface({ repo, active }: { repo: RepoDetail; active
     try {
       const session = await ensureTerminalSession(repo.id, repo.path, nextSize?.cols, nextSize?.rows);
       sessionRef.current = session;
+      setSessionId(session.sessionId);
+      sessionBindingRef.current?.bindSession(session.sessionId);
       setShellLabel(session.shell);
       setStatus('running');
       scheduleResize();
@@ -81,7 +85,7 @@ export function RepoTerminalSurface({ repo, active }: { repo: RepoDetail; active
       cursorBlink: true,
       fontFamily: 'JetBrains Mono, Consolas, monospace',
       fontSize: 12,
-      scrollback: 8000,
+      scrollback: 2000,
       theme: {
         background: '#0b1220',
         foreground: '#dbe7f5',
@@ -110,6 +114,8 @@ export function RepoTerminalSurface({ repo, active }: { repo: RepoDetail; active
     terminal.open(viewportRef.current);
     terminalRef.current = terminal;
     fitAddonRef.current = fitAddon;
+    outputWriterRef.current = new TerminalOutputWriter(terminal);
+    outputWriterRef.current.setEnabled(active);
 
     const inputDisposable = terminal.onData(data => {
       const session = sessionRef.current;
@@ -121,6 +127,10 @@ export function RepoTerminalSurface({ repo, active }: { repo: RepoDetail; active
 
     return () => {
       inputDisposable.dispose();
+      sessionBindingRef.current?.dispose();
+      sessionBindingRef.current = null;
+      outputWriterRef.current?.dispose();
+      outputWriterRef.current = null;
       terminal.dispose();
       terminalRef.current = null;
       fitAddonRef.current = null;
@@ -128,24 +138,35 @@ export function RepoTerminalSurface({ repo, active }: { repo: RepoDetail; active
   }, []);
 
   useEffect(() => {
-    const stopOutput = EventsOn(TERMINAL_OUTPUT_EVENT, payload => {
-      if (!payload || payload.sessionId !== sessionRef.current?.sessionId) return;
-      terminalRef.current?.write(typeof payload.chunk === 'string' ? payload.chunk : '');
-    });
-    const stopExit = EventsOn(TERMINAL_EXIT_EVENT, payload => {
-      if (!payload || payload.sessionId !== sessionRef.current?.sessionId) return;
-      const nextExitCode = typeof payload.exitCode === 'number' ? payload.exitCode : -1;
-      sessionRef.current = null;
-      setStatus('exited');
-      setExitCode(nextExitCode);
-      terminalRef.current?.write(`\r\n\x1b[90m[process exited ${nextExitCode}]\x1b[0m\r\n`);
+    sessionBindingRef.current?.dispose();
+    sessionBindingRef.current = null;
+    if (!sessionId) {
+      return;
+    }
+
+    sessionBindingRef.current = terminalEventBus.createSubscription({
+      onOutput: chunk => {
+        outputWriterRef.current?.enqueue(chunk);
+      },
+      onExit: exitCode => {
+        sessionRef.current = null;
+        setSessionId(null);
+        setStatus('exited');
+        setExitCode(exitCode);
+        outputWriterRef.current?.enqueue(`\r\n\x1b[90m[process exited ${exitCode}]\x1b[0m\r\n`);
+      },
     });
+    sessionBindingRef.current.bindSession(sessionId);
 
     return () => {
-      stopOutput();
-      stopExit();
+      sessionBindingRef.current?.dispose();
+      sessionBindingRef.current = null;
     };
-  }, []);
+  }, [sessionId]);
+
+  useEffect(() => {
+    outputWriterRef.current?.setEnabled(active);
+  }, [active]);
 
   useEffect(() => {
     if (!active) return;
diff --git a/terminal_manager.go b/terminal_manager.go
index c843007..c5f3b26 100644
--- a/terminal_manager.go
+++ b/terminal_manager.go
@@ -204,13 +204,13 @@ func (s *terminalSession) Resize(cols, rows int) error {
 
 func (s *terminalSession) streamOutput() {
 	buffer := make([]byte, 32*1024)
+	outputs := newTerminalOutputBatcher(s.id, s.emit)
+	defer outputs.Close()
+
 	for {
 		readBytes, err := s.host.Read(buffer)
 		if readBytes > 0 {
-			s.emit(terminalOutputEventName, terminalOutputEvent{
-				SessionID: s.id,
-				Chunk:     string(buffer[:readBytes]),
-			})
+			outputs.Add(string(buffer[:readBytes]))
 		}
 		if errors.Is(err, io.EOF) {
 			break
diff --git a/terminal_manager_windows_test.go b/terminal_manager_windows_test.go
index 8f57da2..b40c408 100644
--- a/terminal_manager_windows_test.go
+++ b/terminal_manager_windows_test.go
@@ -126,6 +126,64 @@ func TestTerminalManagerSupportsCtrlC(t *testing.T) {
 	}
 }
 
+func TestTerminalManagerHighVolumeOutputBatchesEvents(t *testing.T) {
+	outputs := make(chan string, 2048)
+	exits := make(chan int, 4)
+	manager := newTerminalManager(func(name string, payload any) {
+		switch value := payload.(type) {
+		case terminalOutputEvent:
+			if name == terminalOutputEventName {
+				outputs <- value.Chunk
+			}
+		case terminalExitEvent:
+			if name == terminalExitEventName {
+				exits <- value.ExitCode
+			}
+		}
+	})
+	defer func() {
+		manager.CloseAll()
+		select {
+		case <-exits:
+		case <-time.After(5 * time.Second):
+			t.Fatal("terminal session did not exit during cleanup")
+		}
+	}()
+
+	session, err := manager.EnsureSession(TerminalSessionRequest{RepoID: "repo-a", RepoPath: t.TempDir()})
+	if err != nil {
+		t.Fatalf("ensure session: %v", err)
+	}
+
+	command := "1..5000 | ForEach-Object { Write-Output \"line-$($_)\" }; Write-Output ('__terminal_' + 'perf_done__')\r"
+	if err := manager.WriteInput(session.SessionID, command); err != nil {
+		t.Fatalf("write pressure command: %v", err)
+	}
+
+	eventCount := 0
+	var combined strings.Builder
+	deadline := time.After(15 * time.Second)
+	for {
+		select {
+		case chunk := <-outputs:
+			eventCount++
+			combined.WriteString(chunk)
+			text := combined.String()
+			if strings.Contains(text, "__terminal_perf_done__") {
+				if !strings.Contains(text, "line-5000") {
+					t.Fatal("terminal pressure output missing expected tail marker")
+				}
+				if eventCount >= 512 {
+					t.Fatalf("expected batched terminal events under heavy output, got %d", eventCount)
+				}
+				return
+			}
+		case <-deadline:
+			t.Fatalf("timed out waiting for terminal pressure output after %d events", eventCount)
+		}
+	}
+}
+
 func waitForChunk(ch <-chan string, timeout time.Duration, match func(chunk string) bool) bool {
 	deadline := time.After(timeout)
 	for {
diff --git a/terminal_types.go b/terminal_types.go
index e42a598..0eb1af9 100644
--- a/terminal_types.go
+++ b/terminal_types.go
@@ -1,10 +1,14 @@
 package main
 
+import "time"
+
 const (
-	terminalOutputEventName = "repo-terminal-output"
-	terminalExitEventName   = "repo-terminal-exit"
-	defaultTerminalCols     = 120
-	defaultTerminalRows     = 32
+	terminalOutputEventName            = "repo-terminal-output"
+	terminalExitEventName              = "repo-terminal-exit"
+	defaultTerminalCols                = 120
+	defaultTerminalRows                = 32
+	defaultTerminalOutputFlushInterval = 16 * time.Millisecond
+	defaultTerminalOutputBatchBytes    = 64 * 1024
 )
 
 type TerminalSessionRequest struct {
diff --git a/tsconfig.snapshot-tests.json b/tsconfig.snapshot-tests.json
index 5b7ee18..b3d1408 100644
--- a/tsconfig.snapshot-tests.json
+++ b/tsconfig.snapshot-tests.json
@@ -22,6 +22,10 @@
     "src/app/repo-status.test.ts",
     "src/app/snapshot-coordinator.ts",
     "src/app/snapshot-coordinator.test.ts",
+    "src/app/terminal-event-bus.ts",
+    "src/app/terminal-event-bus.test.ts",
+    "src/app/terminal-output-writer.ts",
+    "src/app/terminal-output-writer.test.ts",
     "src/app/types.ts"
   ]
 }
```

### Staged

```diff
No staged diff.
```

### Untracked Files

#### `.codestable/goals/2026-07-04-terminal-stream-performance/approval-report.md`

```
---
doc_type: approval-report
unit: .codestable/goals/2026-07-04-terminal-stream-performance
status: pending
reason: review-authorization
created_at: 2026-07-04
---

# Approval Report

## Decision Needed

是否授权 CodeStable 对本 goal 启动 Task agent，执行：

- 独立 implementation review
- 独立功能验收

## Why Now

按 `.codestable/reference/execution-conventions.md`，实现完成后必须经过独立 review；按 `cs-goal`，标记 `complete` 前必须有 Task agent 功能验收。当前代码和本地验证已经完成，下一步就是这个终端 gate。

## Context

本轮优化只覆盖仓库终端 Tab，owner 已明确：

- 交互优先
- 不扩展到其他输出 UI
- 完成证据用“真实场景 + 可复现压测”双证据

当前已完成的实现：

- 后端新增 `terminalOutputBatcher`，按 `16ms` 和 `64KB` 策略合并 PTY 高频输出，减少 Wails 事件风暴。
- 前端新增 `TerminalOutputWriter`，把终端输出改成逐帧分批写入 xterm，而不是逐事件立刻 `write()`。
- 终端 `scrollback` 从 `8000` 收紧到 `2000`，优先把资源让给交互流畅性。
- 压测与验证已补齐。

最近一轮额外优化：

- 后端 batcher 的 pending 容器从字符串数组换成 `bytes.Buffer`，减少 join 分配。
- 前端 writer 去掉 `shift()` 热点，改成游标式消费与按需压缩。

当前证据：

- `go test ./...`：passed
- `go test -run TestTerminalOutputBatcher -count=1`：passed
- `go test -run TestTerminalManagerHighVolumeOutputBatchesEvents -count=1`：passed
- `go test -bench BenchmarkTerminalOutputBatcherBurst -benchmem -run ^$`：passed
  - `40156 ns/op`
  - `196817 B/op`
  - `16 allocs/op`
- `npm run test:snapshot-coordinator`：passed（18/18）
- `npm run web:build`：passed
- `npm run build`：passed（Wails build）
- 真实 PTY 压测：`5000` 行 PowerShell 输出，事件数断言 `< 512`
- 前端 writer 压测：`5000` 次 `enqueue`，最终写入次数断言 `< 20`

## Options

1. Task agent review + acceptance（推荐）
2. 暂不授权，goal 保持 `active`

## Recommendation

选择选项 1。当前实现收益和本地证据已经齐备，最合理的下一步是让独立 Task agent 只读审查 diff，并按 owner 的 done signal 做终端功能验收。

## Risks And Tradeoffs

- 若不做独立 review，可能遗漏高频输出下的边角行为回归，例如输出顺序、退出尾消息时序、隐藏 Tab 恢复后的刷写节奏。
- 若不做功能验收，当前只能证明“本地压测和构建通过”，不能按 goal 规则证明“实际终端体验满足 owner 预期”。

## Non-Automatic Actions

- 这不会自动 commit、merge、push、deploy。
- 即使你授权 Task agent，review finding 也不会被自动接受；我仍会核对并决定是否需要继续修正。

## After You Answer

- 若授权：我启动独立 Task agent review 与功能验收，完成后立即关闭不再使用的子代理，再根据结果决定是否关闭 goal。
- 若不授权：goal 保持 `active`，等待后续决策。
```

#### `.codestable/goals/2026-07-04-terminal-stream-performance/goal.md`

```
---
doc_type: goal
goal: terminal-stream-performance
status: active
---

# 终端高频输出性能优化

## Objective

优化仓库终端 Tab 在高频海量输出场景下的性能，重点处理 `codex`、`claude` 这类持续刷屏 CLI，让终端在长时间高速输出时仍保持交互流畅、资源占用低且行为稳定。

## Starting Point

当前终端输出链路是“后端读到一块就发一块事件，前端收到一条就立刻写一条 xterm”。这种逐事件直通模式在普通命令下可用，但面对 agent 类 CLI 的持续高频输出时，容易把性能消耗堆到事件频率和渲染次数上。

## Acceptance Criteria

- 在真实高频 CLI 持续输出场景下，终端输入、滚动和切换 Tab 仍保持稳定，不出现明显卡顿或失去响应。
- 终端输出链路具备明确的批量 / 裁剪 / 节流策略，资源占用明显低于逐事件立刻渲染的现状。
- 提供一个可复现的本地压测或基准，能证明高频输出下的性能改善方向和稳定性。
- 完成代码验证与独立功能验收。

## Non-Goals

- 不扩展到右侧命令输出面板或其他流式文本区域。
- 不改变终端的基本交互语义，例如 Ctrl+C、方向键、彩色输出、resize。
- 不新增终端设置页或复杂性能调参 UI。

## Decisions And Assumptions

- owner 已明确选择：交互优先，而不是历史优先。
- 优化范围只限终端 Tab，不碰其他输出 UI。
- 完成证据采用“双证据”：真实高频 CLI 场景 + 可复现本地压测。
- 历史保留可以为性能让路，只要不破坏终端基本可用性。

## Current State

后端输出批量合并、前端逐帧分批写入、scrollback 收敛和压力测试已完成，本地验证全部通过。近期又把后端 batcher 和前端 writer 的热路径进一步压缩，benchmark 和真实 PTY 压测都比首版更稳。当前只剩 CodeStable 终端 gate：等待 owner 决定是否授权 Task agent 做独立 review 与功能验收。

## Next Action

等待 owner 决定是否授权 Task agent 执行独立 review 与功能验收。
```

#### `.codestable/goals/2026-07-04-terminal-stream-performance/iterations/001.md`

```
---
doc_type: goal-iteration
goal: "terminal-stream-performance"
iteration: 1
status_after: active
next_action: "等待 owner 决定是否授权 Task agent 执行独立 review 与功能验收；若授权，则继续终端 gate 并准备 goal 收尾。"
blocker_signature: null
updated_at: "2026-07-04"
---

# Iteration 001

## Current Understanding

这次性能问题的关键不是单个 PTY chunk 大小，而是“后端逐 chunk 发事件 + 前端逐事件立刻写 xterm”带来的事件风暴和渲染过频。`codex`、`claude` 这类持续刷屏 CLI 会把这一点放大，最终表现为 CPU 偏高、交互抖动和资源占用膨胀。

## Implementation Approach

- 后端新增终端输出 batcher，把短时间内的高频 PTY 输出合并后再发 Wails 事件。
- 前端新增可测试的终端输出 writer，把事件消费改成逐帧分批写入 xterm，而不是每条事件立即 `write()`。
- 为了交互优先，主动收紧 scrollback，并补纯逻辑测试、真实高输出 PTY 测试和可复现 benchmark。

## Changes This Iteration

- 新增 `terminal_output_batcher.go` 与 `terminal_output_batcher_test.go`，默认按 `16ms` flush interval 和 `64KB` batch 上限聚合终端输出。
- 更新 `terminal_manager.go`，把 PTY 输出流从“读到就发”改成经 `terminalOutputBatcher` 合并后再 `EventsEmit`。
- 新增 `src/app/terminal-output-writer.ts` 与 `src/app/terminal-output-writer.test.ts`，前端改成逐帧分批写入，并在队列积压时主动 compaction。
- 更新 `src/app/components/repo-terminal-surface.tsx`，终端输出不再逐事件直接 `terminal.write()`；同时把 `scrollback` 从 `8000` 收紧到 `2000`。
- 更新 `package.json` 与 `tsconfig.snapshot-tests.json`，把终端 writer 测试纳入既有前端测试入口。
- 更新 `terminal_manager_windows_test.go`，新增真实 PTY 高输出场景测试，验证大量连续输出下事件次数被明显压缩。

## Verification Evidence

- `go test ./...`：passed
- `go test -run TestTerminalOutputBatcher -count=1`：passed
- `go test -run TestTerminalManagerHighVolumeOutputBatchesEvents -count=1`：passed
- `go test -bench BenchmarkTerminalOutputBatcherBurst -benchmem -run ^$`：passed
  - `16460` ops
  - `75529 ns/op`
  - `305777 B/op`
  - `20 allocs/op`
- `npm run test:snapshot-coordinator`：passed（18/18）
- `npm run web:build`：passed
- 真实高输出 PTY 测试中，`5000` 行 PowerShell 输出会带结束标记 `__terminal_perf_done__`；当前断言事件数 `< 512`，用于证明事件合并已生效。
- 纯前端压力测试中，`5000` 次 `enqueue` 最终写入次数 `< 20`，同时保证拼接结果与原始输出完全一致。

## Problems Encountered

- CodeStable 的 goal 终端 gate 需要独立 Task agent review 与功能验收，但当前对话还没有 owner 的明确授权，不能直接启动。
- 本轮尚未补真实桌面 UI 级别的交互录像或 profiler 证据，当前证据主要来自真实 PTY 压测、writer 压力测试与构建结果。

## Next Attempt

等待 owner 决定是否授权 Task agent 执行独立 review 与功能验收；若授权，则继续终端 gate 并准备 goal 收尾。

## State Update

实现和本地验证已经完成，goal 继续保持 `active`。当前下一步是审批决策，而不是继续改代码。
```

#### `.codestable/goals/2026-07-04-terminal-stream-performance/iterations/002.md`

```
---
doc_type: goal-iteration
goal: "terminal-stream-performance"
iteration: 2
status_after: active
next_action: "等待 owner 决定是否授权 Task agent 执行独立 review 与功能验收；若授权，则继续终端 gate 并准备 goal 收尾。"
blocker_signature: null
updated_at: "2026-07-04"
---

# Iteration 002

## Current Understanding

性能目标已经从“把终端做成可用”推进到“把高频刷屏链路压稳”。这轮的真实热点已经定位到输出批量化和前端逐帧写入的热路径，问题不再是功能正确性，而是高频场景下的事件频率、字符串分配和渲染次数。

## Implementation Approach

- 后端 `terminalOutputBatcher` 继续保留 16ms flush 策略，但把 pending 容器从字符串数组换成 `bytes.Buffer`，减少 join 分配。
- 前端 `TerminalOutputWriter` 去掉 `shift()` 热点，改成 offset 游标 + 批量 compaction，避免在大量 chunk 下频繁重排数组。
- 验证以真实 PTY 压测和 benchmark 为主，确认优化确实降低了 batch 写入/emit 次数和内存占用。

## Changes This Iteration

- 优化 `terminal_output_batcher.go`：用 `bytes.Buffer` 承接待发输出，避免频繁 `strings.Join`。
- 优化 `src/app/terminal-output-writer.ts`：移除 `shift()` 热点，改成 `queueOffset` 游标与按需压缩。
- 保持 `RepoTerminalSurface` 的逐帧消费方式和 `scrollback: 2000`，不回退到逐事件直写。

## Verification Evidence

- `go test ./...`：passed
- `go test -run TestTerminalOutputBatcher -count=1`：passed
- `go test -bench BenchmarkTerminalOutputBatcherBurst -benchmem -run ^$`：passed
  - `40156 ns/op`
  - `196817 B/op`
  - `16 allocs/op`
- `npm run test:snapshot-coordinator`：passed（18/18）
- `npm run build`：passed（Wails build）

## Problems Encountered

- 没有新的功能性阻塞；当前剩余工作仍是 CodeStable 终端 gate 的 Task agent 授权。

## Next Attempt

等待 owner 决定是否授权 Task agent 执行独立 review 与功能验收；若授权，则继续终端 gate 并准备 goal 收尾。

## State Update

这轮完成了热路径的进一步压缩，性能证据比上一轮更强。goal 继续保持 `active`，等待审查/验收授权。
```

#### `.codestable/goals/2026-07-04-terminal-stream-performance/state.yaml`

```
schema_version: 1
goal: "terminal-stream-performance"
status: active
objective: "优化仓库终端 Tab 在高频海量输出场景下的性能，重点处理 codex / claude 这类持续刷屏 CLI，达到交互优先、资源占用低、性能稳定，并用真实场景与可复现压测给出完成证据。"
start_point: "当前终端 Tab 对每个 Wails 输出事件都会立刻写入 xterm.js，后端也按读取到的 chunk 逐次 EventsEmit；在 codex / claude 这类高频流式输出场景下，容易因为事件过密和渲染过频导致卡顿、CPU 升高和资源占用膨胀。"
acceptance:
  - "在真实高频 CLI 持续输出场景下，终端输入、滚动和切换 Tab 仍保持稳定，不出现明显卡顿或失去响应。"
  - "终端输出链路具备明确的批量/裁剪/节流策略，资源占用明显低于逐事件立刻渲染的现状。"
  - "提供一个可复现的本地压测或基准，能证明高频输出下的性能改善方向和稳定性。"
  - "完成代码验证与独立功能验收。"
non_goals:
  - "不扩展到右侧命令输出面板或其他流式文本区域。"
  - "不改变终端的基本交互语义，例如 Ctrl+C、方向键、彩色输出、resize。"
  - "不新增终端设置页或复杂性能调参 UI。"
budget:
  kind: none
  limit: null
current_iteration: 2
next_action: "等待 owner 决定是否授权 Task agent 执行独立 review 与功能验收；若授权，则继续终端 gate 并准备 goal 收尾。"
blocker_signature: null
blocker_count: 0
owner_stop: null
updated_at: "2026-07-04"
```

#### `src/app/terminal-event-bus.test.ts`

```
import test from 'node:test';
import assert from 'node:assert/strict';
import { TerminalEventBus } from './terminal-event-bus.js';

test('terminal event bus routes output and exit events per session and disconnects when empty', () => {
  const events: Array<{ event: string; payload: any }> = [];
  const stops: string[] = [];
  const bus = new TerminalEventBus((event, handler) => {
    events.push({ event, payload: handler });
    return () => {
      stops.push(event);
    };
  });

  const firstOutputs: string[] = [];
  const firstExits: number[] = [];
  const secondOutputs: string[] = [];
  const secondExits: number[] = [];

  const first = bus.createSubscription({
    onOutput: chunk => firstOutputs.push(chunk),
    onExit: exitCode => firstExits.push(exitCode),
  });
  const second = bus.createSubscription({
    onOutput: chunk => secondOutputs.push(chunk),
    onExit: exitCode => secondExits.push(exitCode),
  });
  first.bindSession('term-a');
  second.bindSession('term-b');

  assert.equal(events.length, 2);
  const [outputHandler, exitHandler] = events.map(entry => entry.payload as (payload: any) => void);

  outputHandler({ sessionId: 'term-a', chunk: 'hello' });
  outputHandler({ sessionId: 'term-b', chunk: 'world' });
  exitHandler({ sessionId: 'term-a', exitCode: 0 });
  exitHandler({ sessionId: 'term-b', exitCode: 1 });

  assert.deepEqual(firstOutputs, ['hello']);
  assert.deepEqual(secondOutputs, ['world']);
  assert.deepEqual(firstExits, [0]);
  assert.deepEqual(secondExits, [1]);

  first.dispose();
  assert.deepEqual(stops, []);
  second.dispose();
  assert.deepEqual(stops, ['repo-terminal-output', 'repo-terminal-exit']);
});
```

#### `src/app/terminal-event-bus.ts`

```
const TERMINAL_OUTPUT_EVENT = 'repo-terminal-output';
const TERMINAL_EXIT_EVENT = 'repo-terminal-exit';

type TerminalOutputHandler = (chunk: string) => void;
type TerminalExitHandler = (exitCode: number) => void;
type EventUnsubscribe = () => void;

interface TerminalSessionHandlers {
  onOutput: TerminalOutputHandler;
  onExit: TerminalExitHandler;
}

interface SessionSubscription {
  sessionId: string | null;
  handlers: TerminalSessionHandlers;
}

type EventConnector = (event: string, handler: (payload: any) => void) => EventUnsubscribe;

export class TerminalEventBus {
  private readonly sessions = new Set<SessionSubscription>();
  private outputStop: EventUnsubscribe | null = null;
  private exitStop: EventUnsubscribe | null = null;

  constructor(private readonly connect: EventConnector) {}

  createSubscription(handlers: TerminalSessionHandlers) {
    const subscription: SessionSubscription = {
      sessionId: null,
      handlers,
    };
    this.sessions.add(subscription);
    this.ensureConnected();

    return {
      bindSession: (sessionId: string) => {
        subscription.sessionId = sessionId;
      },
      dispose: () => {
        this.sessions.delete(subscription);
        this.maybeDisconnect();
      },
    };
  }

  private ensureConnected() {
    if (this.outputStop || this.exitStop) {
      return;
    }

    this.outputStop = this.connect(TERMINAL_OUTPUT_EVENT, payload => {
      if (!payload || typeof payload.sessionId !== 'string') return;
      const chunk = typeof payload.chunk === 'string' ? payload.chunk : '';
      if (!chunk) return;
      for (const subscription of this.sessions) {
        if (subscription.sessionId === payload.sessionId) {
          subscription.handlers.onOutput(chunk);
        }
      }
    });

    this.exitStop = this.connect(TERMINAL_EXIT_EVENT, payload => {
      if (!payload || typeof payload.sessionId !== 'string') return;
      const exitCode = typeof payload.exitCode === 'number' ? payload.exitCode : -1;
      for (const subscription of this.sessions) {
        if (subscription.sessionId === payload.sessionId) {
          subscription.handlers.onExit(exitCode);
        }
      }
    });
  }

  private maybeDisconnect() {
    if (this.sessions.size > 0) {
      return;
    }
    this.outputStop?.();
    this.exitStop?.();
    this.outputStop = null;
    this.exitStop = null;
  }
}
```

#### `src/app/terminal-output-writer.test.ts`

```
import test from 'node:test';
import assert from 'node:assert/strict';
import { TerminalOutputWriter, type TerminalOutputScheduler } from './terminal-output-writer.js';

function createManualScheduler(): TerminalOutputScheduler & { flushAll: () => void } {
  let nextHandle = 1;
  const tasks = new Map<number, () => void>();

  return {
    schedule(callback) {
      const handle = nextHandle++;
      tasks.set(handle, callback);
      return handle;
    },
    cancel(handle) {
      tasks.delete(handle);
    },
    flushAll() {
      while (tasks.size > 0) {
        const [handle, callback] = tasks.entries().next().value as [number, () => void];
        tasks.delete(handle);
        callback();
      }
    },
  };
}

test('terminal output writer preserves output while batching writes', () => {
  const writes: string[] = [];
  const scheduler = createManualScheduler();
  const writer = new TerminalOutputWriter({
    write(data, callback) {
      writes.push(data);
      callback?.();
    },
  }, {
    scheduler,
    maxWriteChars: 8,
  });

  writer.enqueue('ab');
  writer.enqueue('cd');
  writer.enqueue('ef');
  writer.enqueue('gh');
  scheduler.flushAll();

  assert.deepEqual(writes, ['abcdefgh']);
});

test('terminal output writer pressure test collapses many events into few writes', () => {
  const writes: string[] = [];
  const scheduler = createManualScheduler();
  const writer = new TerminalOutputWriter({
    write(data, callback) {
      writes.push(data);
      callback?.();
    },
  }, {
    scheduler,
    maxWriteChars: 4096,
    compactThreshold: 8,
  });

  let expected = '';
  for (let i = 0; i < 5000; i++) {
    const chunk = `line-${i}\n`;
    expected += chunk;
    writer.enqueue(chunk);
  }
  scheduler.flushAll();

  assert.ok(writes.length < 20, `expected fewer than 20 writes, got ${writes.length}`);
  assert.equal(writes.join(''), expected);
});

test('terminal output writer reset drops pending buffered output', () => {
  const writes: string[] = [];
  const scheduler = createManualScheduler();
  const writer = new TerminalOutputWriter({
    write(data, callback) {
      writes.push(data);
      callback?.();
    },
  }, {
    scheduler,
  });

  writer.enqueue('before-reset');
  writer.reset();
  scheduler.flushAll();
  writer.enqueue('after-reset');
  scheduler.flushAll();

  assert.deepEqual(writes, ['after-reset']);
});

test('terminal output writer can pause and resume without losing queued output', () => {
  const writes: string[] = [];
  const scheduler = createManualScheduler();
  const writer = new TerminalOutputWriter({
    write(data, callback) {
      writes.push(data);
      callback?.();
    },
  }, {
    scheduler,
    maxWriteChars: 8,
  });

  writer.setEnabled(false);
  writer.enqueue('one');
  writer.enqueue('two');
  scheduler.flushAll();
  assert.deepEqual(writes, []);

  writer.setEnabled(true);
  scheduler.flushAll();
  assert.deepEqual(writes, ['onetwo']);
});
```

#### `src/app/terminal-output-writer.ts`

```
export interface TerminalOutputSink {
  write(data: string, callback?: () => void): void;
}

export interface TerminalOutputScheduler {
  schedule(callback: () => void): number;
  cancel(handle: number): void;
}

interface TerminalOutputWriterOptions {
  maxWriteChars?: number;
  compactThreshold?: number;
  scheduler?: TerminalOutputScheduler;
}

const DEFAULT_MAX_WRITE_CHARS = 64 * 1024;
const DEFAULT_COMPACT_THRESHOLD = 32;

export class TerminalOutputWriter {
  private queue: string[] = [];
  private queueOffset = 0;
  private scheduled: number | null = null;
  private writing = false;
  private enabled = true;
  private readonly maxWriteChars: number;
  private readonly compactThreshold: number;
  private readonly scheduler: TerminalOutputScheduler;

  constructor(
    private readonly sink: TerminalOutputSink,
    options: TerminalOutputWriterOptions = {},
  ) {
    this.maxWriteChars = Math.max(1024, options.maxWriteChars ?? DEFAULT_MAX_WRITE_CHARS);
    this.compactThreshold = Math.max(2, options.compactThreshold ?? DEFAULT_COMPACT_THRESHOLD);
    this.scheduler = options.scheduler ?? createTerminalFrameScheduler();
  }

  enqueue(chunk: string) {
    if (!chunk) {
      return;
    }
    this.queue.push(chunk);
    this.compactIfNeeded();
    this.schedule();
  }

  setEnabled(enabled: boolean) {
    if (this.enabled === enabled) {
      return;
    }
    this.enabled = enabled;
    if (!enabled) {
      if (this.scheduled !== null) {
        this.scheduler.cancel(this.scheduled);
        this.scheduled = null;
      }
      return;
    }
    this.schedule();
  }

  reset() {
    if (this.scheduled !== null) {
      this.scheduler.cancel(this.scheduled);
      this.scheduled = null;
    }
    this.queue = [];
    this.queueOffset = 0;
  }

  dispose() {
    this.reset();
  }

  private schedule() {
    if (!this.enabled || this.writing || this.scheduled !== null || this.queue.length === 0) {
      return;
    }
    this.scheduled = this.scheduler.schedule(() => {
      this.scheduled = null;
      this.flushFrame();
    });
  }

  private flushFrame() {
    if (!this.enabled || this.writing || this.queue.length === 0) {
      return;
    }
    this.writing = true;
    this.sink.write(this.takeNextPayload(), () => {
      this.writing = false;
      this.schedule();
    });
  }

  private takeNextPayload() {
    const parts: string[] = [];
    let size = 0;

    for (; this.queueOffset < this.queue.length; ) {
      const chunk = this.queue[this.queueOffset];
      const available = this.maxWriteChars - size;
      if (available <= 0) {
        break;
      }
      if (chunk.length <= available) {
        parts.push(chunk);
        size += chunk.length;
        this.queueOffset += 1;
        continue;
      }
      parts.push(chunk.slice(0, available));
      this.queue[this.queueOffset] = chunk.slice(available);
      size += available;
      break;
    }

    if (this.queueOffset > 0 && this.queueOffset >= this.queue.length) {
      this.queue = [];
      this.queueOffset = 0;
    } else if (this.queueOffset > this.compactThreshold && this.queueOffset * 2 >= this.queue.length) {
      this.queue = this.queue.slice(this.queueOffset);
      this.queueOffset = 0;
    }

    return parts.join('');
  }

  private compactIfNeeded() {
    if (this.queue.length - this.queueOffset < this.compactThreshold) {
      return;
    }
    const active = this.queue.slice(this.queueOffset);
    this.queue = [active.join('')];
    this.queueOffset = 0;
  }
}

export function createTerminalFrameScheduler(): TerminalOutputScheduler {
  return {
    schedule(callback) {
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        return window.requestAnimationFrame(() => callback());
      }
      return setTimeout(callback, 16) as unknown as number;
    },
    cancel(handle) {
      if (typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(handle);
        return;
      }
      clearTimeout(handle);
    },
  };
}
```

#### `src/app/terminal-runtime-event-bus.ts`

```
import { EventsOn } from '../../frontend/wailsjs/runtime/runtime.js';
import { TerminalEventBus } from './terminal-event-bus.js';

export const terminalEventBus = new TerminalEventBus((event, handler) => EventsOn(event, handler));
```

#### `terminal_output_batcher.go`

```
package main

import (
	"bytes"
	"sync"
	"time"
)

type terminalOutputBatcher struct {
	sessionID     string
	emit          terminalEmitter
	flushInterval time.Duration
	maxBatchBytes int

	mu           sync.Mutex
	pending      bytes.Buffer
	pendingBytes int
	timer        *time.Timer
	closed       bool
}

func newTerminalOutputBatcher(sessionID string, emit terminalEmitter) *terminalOutputBatcher {
	return newTerminalOutputBatcherWithConfig(
		sessionID,
		emit,
		defaultTerminalOutputFlushInterval,
		defaultTerminalOutputBatchBytes,
	)
}

func newTerminalOutputBatcherWithConfig(
	sessionID string,
	emit terminalEmitter,
	flushInterval time.Duration,
	maxBatchBytes int,
) *terminalOutputBatcher {
	if flushInterval <= 0 {
		flushInterval = defaultTerminalOutputFlushInterval
	}
	if maxBatchBytes < 1024 {
		maxBatchBytes = defaultTerminalOutputBatchBytes
	}
	return &terminalOutputBatcher{
		sessionID:     sessionID,
		emit:          emit,
		flushInterval: flushInterval,
		maxBatchBytes: maxBatchBytes,
	}
}

func (b *terminalOutputBatcher) Add(chunk string) {
	if chunk == "" {
		return
	}

	payload := ""
	b.mu.Lock()
	if !b.closed {
		b.pending.WriteString(chunk)
		b.pendingBytes += len(chunk)
		if b.pendingBytes >= b.maxBatchBytes {
			if b.timer != nil {
				b.timer.Stop()
				b.timer = nil
			}
			payload = b.flushLocked()
		} else {
			b.ensureTimerLocked()
		}
	}
	b.mu.Unlock()

	b.emitPayload(payload)
}

func (b *terminalOutputBatcher) Close() {
	payload := ""
	b.mu.Lock()
	if !b.closed {
		b.closed = true
		if b.timer != nil {
			b.timer.Stop()
			b.timer = nil
		}
		payload = b.flushLocked()
	}
	b.mu.Unlock()

	b.emitPayload(payload)
}

func (b *terminalOutputBatcher) ensureTimerLocked() {
	if b.timer != nil {
		return
	}
	b.timer = time.AfterFunc(b.flushInterval, b.flushAsync)
}

func (b *terminalOutputBatcher) flushAsync() {
	b.emitPayload(b.takePending())
}

func (b *terminalOutputBatcher) takePending() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.flushLocked()
}

func (b *terminalOutputBatcher) flushLocked() string {
	if b.pending.Len() == 0 {
		return ""
	}
	payload := b.pending.String()
	b.pending.Reset()
	b.pendingBytes = 0
	b.timer = nil
	return payload
}

func (b *terminalOutputBatcher) emitPayload(payload string) {
	if payload == "" {
		return
	}
	b.emit(terminalOutputEventName, terminalOutputEvent{
		SessionID: b.sessionID,
		Chunk:     payload,
	})
}
```

#### `terminal_output_batcher_test.go`

```
package main

import (
	"strings"
	"testing"
	"time"
)

func TestTerminalOutputBatcherFlushesOnSizeThreshold(t *testing.T) {
	var chunks []string
	batcher := newTerminalOutputBatcherWithConfig("term-1", func(_ string, payload any) {
		event := payload.(terminalOutputEvent)
		chunks = append(chunks, event.Chunk)
	}, time.Hour, 12)

	batcher.Add("abc")
	batcher.Add("def")
	batcher.Add("ghi")
	batcher.Add("jkl")
	batcher.Close()

	if len(chunks) != 1 {
		t.Fatalf("expected one emitted chunk, got %d", len(chunks))
	}
	if chunks[0] != "abcdefghijkl" {
		t.Fatalf("unexpected payload %q", chunks[0])
	}
}

func TestTerminalOutputBatcherFlushesOnTimer(t *testing.T) {
	var chunks []string
	batcher := newTerminalOutputBatcherWithConfig("term-1", func(_ string, payload any) {
		event := payload.(terminalOutputEvent)
		chunks = append(chunks, event.Chunk)
	}, 10*time.Millisecond, 1024)

	batcher.Add("hello")
	time.Sleep(40 * time.Millisecond)
	batcher.Close()

	if len(chunks) != 1 {
		t.Fatalf("expected one emitted chunk after timer flush, got %d", len(chunks))
	}
	if chunks[0] != "hello" {
		t.Fatalf("unexpected payload %q", chunks[0])
	}
}

func TestTerminalOutputBatcherPressureCollapsesManyChunks(t *testing.T) {
	emits := 0
	var payload strings.Builder
	batcher := newTerminalOutputBatcherWithConfig("term-1", func(_ string, event any) {
		emits++
		payload.WriteString(event.(terminalOutputEvent).Chunk)
	}, time.Hour, 64*1024)

	for i := 0; i < 4096; i++ {
		batcher.Add("0123456789abcdef")
	}
	batcher.Close()

	if emits > 2 {
		t.Fatalf("expected heavy burst to collapse into at most 2 emits, got %d", emits)
	}
	if payload.Len() != 4096*16 {
		t.Fatalf("unexpected payload length %d", payload.Len())
	}
}

func BenchmarkTerminalOutputBatcherBurst(b *testing.B) {
	chunks := make([]string, 4096)
	for i := range chunks {
		chunks[i] = "0123456789abcdef"
	}

	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		batcher := newTerminalOutputBatcherWithConfig("term-1", func(string, any) {}, time.Hour, 64*1024)
		for _, chunk := range chunks {
			batcher.Add(chunk)
		}
		batcher.Close()
	}
}
```


## Validation Commands And Results
- go test ./... -> passed
- go test -run TestTerminalManagerHighVolumeOutputBatchesEvents -count=1 -> passed
- go test -bench BenchmarkTerminalOutputBatcherBurst -benchmem -run ^$ -> 41842 ns/op, 196816 B/op, 16 allocs/op
- npm run test:snapshot-coordinator -> passed (20/20)
- npm run web:build -> passed
- npm run build -> passed

## Reviewer Risk Prompts
- Check database and migration safety.
- Check concurrency and race conditions.
- Check idempotency and rerun behavior.
- Check crash-resume persistence.
- Check provider cost and production writes.
- Check deterministic LLM boundary for IDs, paths, enums, and foreign keys.
