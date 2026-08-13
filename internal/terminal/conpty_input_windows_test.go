//go:build windows && integration

package terminal

import (
	"io"
	"os"
	"os/exec"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/charmbracelet/x/conpty"
	"golang.org/x/sys/windows"
)

func TestConPTYPreservesRawLineFeedInput(t *testing.T) {
	node, err := exec.LookPath("node.exe")
	if err != nil {
		t.Skipf("skip: node.exe unavailable: %v", err)
	}

	pty, err := conpty.New(100, 30, 0)
	if err != nil {
		t.Fatalf("create ConPTY: %v", err)
	}
	defer func() { _ = pty.Close() }()

	const script = "process.stdin.setRawMode(true); process.stdin.setEncoding('utf8'); process.stdin.resume(); process.stdout.write('READY\\r\\n'); process.stdin.on('data', data => process.stdout.write('RX:' + Buffer.from(data).toString('hex') + '\\r\\n')); setInterval(() => {}, 1000);"
	_, process, err := pty.Spawn(node, []string{node, "-e", script}, &syscall.ProcAttr{Env: os.Environ()})
	if err != nil {
		t.Fatalf("spawn raw Node probe: %v", err)
	}
	processHandle := windows.Handle(process)
	defer func() {
		_ = windows.TerminateProcess(processHandle, 1)
		_ = windows.CloseHandle(processHandle)
	}()

	output := make(chan string, 16)
	go readConPTYOutput(pty, output)
	waitForConPTYOutput(t, output, "READY")

	// Rule: this is the precise transport used by the Pi compatibility path.
	// ConPTY strips bracketed-paste markers, but it must preserve raw LF so Pi
	// receives a newline rather than the CR that submits its editor.
	const input = "first\nsecond\nthird"
	if _, err := pty.Write([]byte(input)); err != nil {
		t.Fatalf("write raw LF input: %v", err)
	}
	waitForConPTYOutput(t, output, "RX:66697273740a7365636f6e640a7468697264")
}

func readConPTYOutput(pty *conpty.ConPty, output chan<- string) {
	buffer := make([]byte, 4096)
	for {
		readBytes, err := pty.Read(buffer)
		if readBytes > 0 {
			output <- string(buffer[:readBytes])
		}
		if err != nil {
			if err != io.EOF {
				output <- "READ_ERROR:" + err.Error()
			}
			return
		}
	}
}

func waitForConPTYOutput(t *testing.T, output <-chan string, wanted string) {
	t.Helper()
	var combined strings.Builder
	deadline := time.After(5 * time.Second)
	for {
		select {
		case chunk := <-output:
			combined.WriteString(chunk)
			if strings.Contains(combined.String(), wanted) {
				return
			}
		case <-deadline:
			t.Fatalf("timed out waiting for %q in ConPTY output %q", wanted, combined.String())
		}
	}
}
