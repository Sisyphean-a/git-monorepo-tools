# 随包 ConPTY

`win10-x64/` 下的 `conpty.dll` 与 `OpenConsole.exe` 是 **Windows Terminal 源码构建的现代 ConPTY**，
由 [node-pty](https://github.com/microsoft/node-pty) 的 `third_party/conpty/1.23.251008001/win10-x64/`
原样分发（`conpty.dll` 是它的实现，`OpenConsole.exe` 是必须与它同目录的控制台宿主）。

## 为什么必须随包

Windows 10 的 `kernel32!CreatePseudoConsole` 会回退到 inbox 实现（`conhost.exe --headless`），
它在输出侧丢弃 `1049h`、`1000h`、`1002h`、`1003h`、`1006h`，在输入侧吞掉 SGR 鼠标上报，
导致内嵌终端里 Pi 全屏滚轮完全无效；Windows 10 即使装了 Windows Terminal，`System32` 里也没有
可用的 `conpty.dll`，因此只能由应用自己携带。Windows 11 的 inbox 实现已是现代版本，随包分发让
两个系统行为一致。判断依据与契约见 `.codestable/requirements/adrs/004-windows-embedded-terminal-modern-conpty.md`。

## 许可

Windows Terminal 与其 ConPTY 组件使用 MIT 许可（Copyright (c) Microsoft Corporation），
node-pty 同样以 MIT 许可分发这些二进制；许可文本见同目录的 `LICENSE.node-pty.txt`。

## 更新方式

1. 取目标版本的 `third_party/conpty/<版本>/<平台>/` 目录内容（node-pty 安装包或 Windows Terminal 构建产物）。
2. 覆盖对应架构目录下的 `conpty.dll` 与 `OpenConsole.exe`，并同步 `internal/terminal/conpty_windows.go`
   的 `conptyAssetsVersion`（它同时是解包目录身份，改版本号会换新目录；解包目录用内容哈希复用，换内容不必手动清缓存）。
3. 运行 `go test -tags "windows integration" ./internal/terminal/ -run ConPTY -count=1`，
   确认 DEC 鼠标模式送达与 SGR 鼠标上报到达子进程两项仍然成立。

## 覆盖范围与失败策略

随包 amd64（`win10-x64`）与 arm64（`win10-arm64`）。目录未覆盖的架构、资产解包失败或 DLL 加载失败时，`internal/terminal` 让终端显式启动失败并保留原因，**不会**降级到 inbox 实现——静默回退会把上面描述的缺陷重新带回来。
