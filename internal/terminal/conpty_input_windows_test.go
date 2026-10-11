//go:build windows && integration

package terminal

import (
	"os"
	"os/exec"
	"strings"
	"sync"
	"testing"
	"time"

	"golang.org/x/sys/windows"
)

// TestConPTYPreservesRawLineFeedInput 固定内嵌终端的 LF 输入契约：Pi 文本粘贴依赖原始 LF
// 到达子进程 stdin，而不是被 ConPTY 换成提交编辑器的 CR。
func TestConPTYPreservesRawLineFeedInput(t *testing.T) {
	node, err := exec.LookPath("node.exe")
	if err != nil {
		t.Skipf("skip: node.exe unavailable: %v", err)
	}

	pty, err := newWindowsPty(100, 30)
	if err != nil {
		t.Fatalf("create pseudo console: %v", err)
	}
	defer func() { _ = pty.Close() }()

	const script = "process.stdin.setRawMode(true); process.stdin.setEncoding('utf8'); process.stdin.resume(); process.stdout.write('READY\\r\\n'); process.stdin.on('data', data => process.stdout.write('RX:' + Buffer.from(data).toString('hex') + '\\r\\n')); setInterval(() => {}, 1000);"
	handle, err := pty.spawn(node, []string{node, "-e", script}, "", os.Environ())
	if err != nil {
		t.Fatalf("spawn raw Node probe: %v", err)
	}
	defer func() {
		_ = windows.TerminateProcess(handle, 1)
		_ = windows.CloseHandle(handle)
	}()

	output := startConPTYOutput(pty)
	output.waitFor(t, "READY")

	const input = "first\nsecond\nthird"
	if _, err := pty.Write([]byte(input)); err != nil {
		t.Fatalf("write raw LF input: %v", err)
	}
	output.waitFor(t, "RX:66697273740a7365636f6e640a7468697264")
}

// conPTYTestOutput 记录伪控制台读取侧的全部输出，并按子串等待。
type conPTYTestOutput struct {
	mu      sync.Mutex
	text    string
	changed chan struct{}
}

func startConPTYOutput(pty *windowsPty) *conPTYTestOutput {
	output := &conPTYTestOutput{changed: make(chan struct{}, 1)}
	go func() {
		buffer := make([]byte, 4096)
		for {
			read, err := pty.Read(buffer)
			if read > 0 {
				output.append(string(buffer[:read]))
			}
			if err != nil {
				return
			}
		}
	}()
	return output
}

func (o *conPTYTestOutput) append(chunk string) {
	o.mu.Lock()
	o.text += chunk
	o.mu.Unlock()
	select {
	case o.changed <- struct{}{}:
	default:
	}
}

func (o *conPTYTestOutput) snapshot() string {
	o.mu.Lock()
	defer o.mu.Unlock()
	return o.text
}

func (o *conPTYTestOutput) waitFor(t *testing.T, wanted string) string {
	t.Helper()
	deadline := time.After(15 * time.Second)
	for {
		if text := o.snapshot(); strings.Contains(text, wanted) {
			return text
		}
		select {
		case <-o.changed:
		case <-deadline:
			t.Fatalf("timed out waiting for %q in ConPTY output %q", wanted, o.snapshot())
		}
	}
}
