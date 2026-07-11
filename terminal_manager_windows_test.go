//go:build windows

package main

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestTerminalManagerReusesSessionPerRepo(t *testing.T) {
	manager := newTerminalManager(func(string, any) {})
	repoA := t.TempDir()
	repoB := t.TempDir()

	first, err := manager.EnsureSession(TerminalSessionRequest{RepoID: "repo-a", RepoPath: repoA})
	if err != nil {
		t.Fatalf("ensure first session: %v", err)
	}
	second, err := manager.EnsureSession(TerminalSessionRequest{RepoID: "repo-a", RepoPath: repoA})
	if err != nil {
		t.Fatalf("ensure second session: %v", err)
	}
	other, err := manager.EnsureSession(TerminalSessionRequest{RepoID: "repo-b", RepoPath: repoB})
	if err != nil {
		t.Fatalf("ensure other repo session: %v", err)
	}

	if first.SessionID != second.SessionID {
		t.Fatalf("same repo should reuse session: %s != %s", first.SessionID, second.SessionID)
	}
	if first.SessionID == other.SessionID {
		t.Fatalf("different repos should not share session: %s", first.SessionID)
	}

	manager.CloseAll()
}

func TestTerminalManagerStartsInRepoDirectoryAndCloses(t *testing.T) {
	outputs := make(chan string, 32)
	exits := make(chan int, 4)
	manager := newTerminalManager(func(name string, payload any) {
		switch value := payload.(type) {
		case terminalOutputEvent:
			if name == terminalOutputEventName {
				outputs <- value.Chunk
			}
		case terminalExitEvent:
			if name == terminalExitEventName {
				exits <- value.ExitCode
			}
		}
	})

	repoPath := t.TempDir()
	session, err := manager.EnsureSession(TerminalSessionRequest{RepoID: "repo-a", RepoPath: repoPath, Cols: 100, Rows: 30})
	if err != nil {
		t.Fatalf("ensure session: %v", err)
	}
	if err := manager.Resize(session.SessionID, 120, 32); err != nil {
		t.Fatalf("resize session: %v", err)
	}
	if err := manager.WriteInput(session.SessionID, "(Get-Location).Path\r"); err != nil {
		t.Fatalf("write input: %v", err)
	}

	expectedPath := strings.ToLower(strings.ReplaceAll(repoPath, "/", "\\"))
	if !waitForChunk(outputs, 5*time.Second, func(chunk string) bool {
		return strings.Contains(strings.ToLower(chunk), expectedPath)
	}) {
		t.Fatalf("terminal output did not include repo path %q", expectedPath)
	}

	manager.CloseAll()
	select {
	case <-exits:
	case <-time.After(5 * time.Second):
		t.Fatal("terminal session did not emit exit event after CloseAll")
	}
}

func TestTerminalManagerSupportsCtrlC(t *testing.T) {
	outputs := make(chan string, 64)
	exits := make(chan int, 4)
	manager := newTerminalManager(func(name string, payload any) {
		switch value := payload.(type) {
		case terminalOutputEvent:
			if name == terminalOutputEventName {
				outputs <- value.Chunk
			}
		case terminalExitEvent:
			if name == terminalExitEventName {
				exits <- value.ExitCode
			}
		}
	})
	defer func() {
		manager.CloseAll()
		select {
		case <-exits:
		case <-time.After(5 * time.Second):
			t.Fatal("terminal session did not exit during cleanup")
		}
	}()

	session, err := manager.EnsureSession(TerminalSessionRequest{RepoID: "repo-a", RepoPath: t.TempDir()})
	if err != nil {
		t.Fatalf("ensure session: %v", err)
	}

	if err := manager.WriteInput(session.SessionID, "Start-Sleep -Seconds 10\r"); err != nil {
		t.Fatalf("write sleep input: %v", err)
	}
	time.Sleep(250 * time.Millisecond)
	if err := manager.WriteInput(session.SessionID, "\u0003"); err != nil {
		t.Fatalf("write ctrl+c: %v", err)
	}
	time.Sleep(400 * time.Millisecond)
	if err := manager.WriteInput(session.SessionID, "Write-Output 'after-interrupt'\r"); err != nil {
		t.Fatalf("write follow-up input: %v", err)
	}
	if !waitForChunk(outputs, 5*time.Second, func(chunk string) bool {
		return strings.Contains(strings.ToLower(chunk), "after-interrupt")
	}) {
		t.Fatal("terminal did not continue processing commands after Ctrl+C")
	}
}

func TestTerminalManagerShiftEnterAddsLineBeforeExecution(t *testing.T) {
	assertTerminalManagerShiftEnterAddsLineBeforeExecution(t, "pwsh")
}

func TestTerminalManagerShiftEnterAddsLineBeforeExecutionWithWindowsPowerShell(t *testing.T) {
	powershellPath, err := exec.LookPath("powershell.exe")
	if err != nil {
		t.Fatalf("find powershell.exe: %v", err)
	}
	t.Setenv("PATH", filepath.Dir(powershellPath))
	assertTerminalManagerShiftEnterAddsLineBeforeExecution(t, "powershell")
}

func assertTerminalManagerShiftEnterAddsLineBeforeExecution(t *testing.T, expectedShell string) {
	t.Helper()

	outputs := make(chan string, 64)
	manager := newTerminalManager(func(name string, payload any) {
		if name == terminalOutputEventName {
			outputs <- payload.(terminalOutputEvent).Chunk
		}
	})
	defer manager.CloseAll()

	target := filepath.Join(t.TempDir(), "shift-enter.txt")
	path := strings.ReplaceAll(toWindowsPath(target), "'", "''")
	firstLine := fmt.Sprintf("[IO.File]::WriteAllText('%s','first')", path)
	secondLine := fmt.Sprintf("[IO.File]::AppendAllText('%s','second')", path)
	session, err := manager.EnsureSession(TerminalSessionRequest{RepoID: "repo-a", RepoPath: t.TempDir()})
	if err != nil {
		t.Fatalf("ensure session: %v", err)
	}
	if session.Shell != expectedShell {
		t.Fatalf("expected %s shell, got %s", expectedShell, session.Shell)
	}
	if err := manager.WriteInput(session.SessionID, firstLine+"\x1b[1;8S"+secondLine); err != nil {
		t.Fatalf("write shift+enter input: %v", err)
	}

	time.Sleep(500 * time.Millisecond)
	if _, err := os.Stat(target); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("commands executed before Enter: %v", err)
	}
	if err := manager.WriteInput(session.SessionID, "\r"); err != nil {
		t.Fatalf("write enter: %v", err)
	}

	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		content, err := os.ReadFile(target)
		if err == nil && string(content) == "firstsecond" {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	var output strings.Builder
	for {
		select {
		case chunk := <-outputs:
			output.WriteString(chunk)
		default:
			t.Fatalf("Enter did not execute the complete multi-line command; terminal output: %q", output.String())
		}
	}
}

func TestTerminalManagerHighVolumeOutputBatchesEvents(t *testing.T) {
	outputs := make(chan string, 2048)
	exits := make(chan int, 4)
	manager := newTerminalManager(func(name string, payload any) {
		switch value := payload.(type) {
		case terminalOutputEvent:
			if name == terminalOutputEventName {
				outputs <- value.Chunk
			}
		case terminalExitEvent:
			if name == terminalExitEventName {
				exits <- value.ExitCode
			}
		}
	})
	defer func() {
		manager.CloseAll()
		select {
		case <-exits:
		case <-time.After(5 * time.Second):
			t.Fatal("terminal session did not exit during cleanup")
		}
	}()

	session, err := manager.EnsureSession(TerminalSessionRequest{RepoID: "repo-a", RepoPath: t.TempDir()})
	if err != nil {
		t.Fatalf("ensure session: %v", err)
	}

	command := "1..5000 | ForEach-Object { Write-Output \"line-$($_)\" }; Write-Output ('__terminal_' + 'perf_done__')\r"
	if err := manager.WriteInput(session.SessionID, command); err != nil {
		t.Fatalf("write pressure command: %v", err)
	}

	eventCount := 0
	var combined strings.Builder
	deadline := time.After(15 * time.Second)
	for {
		select {
		case chunk := <-outputs:
			eventCount++
			combined.WriteString(chunk)
			text := combined.String()
			if strings.Contains(text, "__terminal_perf_done__") {
				if !strings.Contains(text, "line-5000") {
					t.Fatal("terminal pressure output missing expected tail marker")
				}
				if eventCount >= 512 {
					t.Fatalf("expected batched terminal events under heavy output, got %d", eventCount)
				}
				return
			}
		case <-deadline:
			t.Fatalf("timed out waiting for terminal pressure output after %d events", eventCount)
		}
	}
}

func waitForChunk(ch <-chan string, timeout time.Duration, match func(chunk string) bool) bool {
	deadline := time.After(timeout)
	for {
		select {
		case chunk := <-ch:
			if match(chunk) {
				return true
			}
		case <-deadline:
			return false
		}
	}
}
