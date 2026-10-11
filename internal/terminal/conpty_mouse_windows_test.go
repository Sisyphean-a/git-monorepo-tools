//go:build windows && integration

package terminal

import (
	"encoding/hex"
	"fmt"
	"os"
	"strings"
	"testing"

	"golang.org/x/sys/windows"
)

// conPTYProbeEnv 让测试二进制以探针子进程身份运行，模拟 Pi 的 VT 输入控制台模式。
const conPTYProbeEnv = "GITMONOREPOTOOLS_CONPTY_PROBE"

// piFullscreenStartupModes 是 Pi TuiAltScreen 进入全屏时的原始写入序列。
const piFullscreenStartupModes = "\x1b[?1049h\x1b[?2004h\x1b[?1000h\x1b[?1002h\x1b[?1003h\x1b[?1006h"

// TestConPTYDeliversPiMouseProtocol 固定内嵌终端的鼠标协议契约：
// Pi 全屏启动写入的 DEC 鼠标模式必须原样到达终端侧，xterm 回传的 SGR 滚轮上报必须到达子进程 stdin。
//
// Failure: Windows 10 的 inbox 伪控制台两项都会丢弃（输出侧丢 1000h/1002h/1003h/1006h，输入侧丢 SGR
// 上报），表现为内嵌终端里 Pi 全屏滚轮完全无效；随包 conpty.dll 必须同时满足两项。
func TestConPTYDeliversPiMouseProtocol(t *testing.T) {
	executable, err := os.Executable()
	if err != nil {
		t.Fatalf("定位测试二进制失败: %v", err)
	}
	childEnvironment := append(os.Environ(), conPTYProbeEnv+"=1")

	pty, err := newWindowsPty(120, 30)
	if err != nil {
		t.Fatalf("create pseudo console: %v", err)
	}
	defer func() { _ = pty.Close() }()

	argv := []string{executable, "-test.run=TestConPTYVTInputProbeChild"}
	handle, err := pty.spawn(executable, argv, "", childEnvironment)
	if err != nil {
		t.Fatalf("spawn VT input probe: %v", err)
	}
	defer func() {
		_ = windows.TerminateProcess(handle, 1)
		_ = windows.CloseHandle(handle)
	}()

	output := startConPTYOutput(pty)
	delivered := output.waitFor(t, "READY")
	for _, mode := range []string{
		"\x1b[?1049h",
		"\x1b[?2004h",
		"\x1b[?1000h",
		"\x1b[?1002h",
		"\x1b[?1003h",
		"\x1b[?1006h",
	} {
		if !strings.Contains(delivered, mode) {
			t.Errorf("终端侧未收到 Pi 启动写入的 %q", mode)
		}
	}

	// xterm 把滚轮上滚编码为 SGR 鼠标上报，子进程必须收到上报本体。
	if _, err := pty.Write([]byte("\x1b[<64;10;5M")); err != nil {
		t.Fatalf("write SGR wheel report: %v", err)
	}
	output.waitFor(t, "3c36343b31303b354d")
}

// TestConPTYVTInputProbeChild 只在探针模式下执行：打开 VT 输入、写出 Pi 启动模式并回显收到的字节。
func TestConPTYVTInputProbeChild(t *testing.T) {
	if os.Getenv(conPTYProbeEnv) != "1" {
		t.Skip("only runs as the pseudo console probe child")
	}
	if err := windows.SetConsoleMode(windows.Stdin, windows.ENABLE_VIRTUAL_TERMINAL_INPUT); err != nil {
		fmt.Fprintf(os.Stderr, "set VT input mode: %v\n", err)
		os.Exit(2)
	}

	_, _ = os.Stdout.WriteString(piFullscreenStartupModes + "READY\r\n")
	buffer := make([]byte, 256)
	for {
		read, err := os.Stdin.Read(buffer)
		if read > 0 {
			_, _ = os.Stdout.WriteString("RX:" + hex.EncodeToString(buffer[:read]) + "\r\n")
		}
		if err != nil {
			os.Exit(0)
		}
	}
}
