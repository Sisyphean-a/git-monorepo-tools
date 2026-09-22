package snapshot

import (
	"errors"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
	"unicode/utf8"
)

func TestRunRepoCommandReturnsCombinedOutput(t *testing.T) {
	service := NewService(t.TempDir())

	result, err := service.RunRepoCommand(RepoCommandRequest{
		RepoPath: t.TempDir(),
		Command:  successShellCommand(),
	})
	if err != nil {
		t.Fatalf("expected command to run, got %v", err)
	}
	if result.ExitCode != 0 {
		t.Fatalf("expected exit code 0, got %d", result.ExitCode)
	}
	if !strings.Contains(result.Output, "hello") {
		t.Fatalf("expected output to contain hello, got %q", result.Output)
	}
	if result.StartedAt == 0 || result.EndedAt == 0 || result.EndedAt < result.StartedAt {
		t.Fatalf("expected timestamps to be populated, got %#v", result)
	}
}

func TestRunRepoCommandRunsMultilineScript(t *testing.T) {
	service := NewService(t.TempDir())

	result, err := service.RunRepoCommand(RepoCommandRequest{
		RepoPath: t.TempDir(),
		Command:  multilineShellCommand(),
	})
	if err != nil {
		t.Fatalf("expected multiline command to run, got %v", err)
	}
	if result.ExitCode != 0 {
		t.Fatalf("expected exit code 0, got %d", result.ExitCode)
	}
	if !strings.Contains(result.Output, "first") || !strings.Contains(result.Output, "second") {
		t.Fatalf("expected output from both lines, got %q", result.Output)
	}
}

func TestRunRepoCommandCapturesExitCode(t *testing.T) {
	repoPath := t.TempDir()
	service := NewService(repoPath)

	result, err := service.RunRepoCommand(RepoCommandRequest{
		RepoPath: repoPath,
		Command:  failingShellCommand(),
	})
	if err != nil {
		t.Fatalf("expected non-zero exit to stay in result, got %v", err)
	}
	if result.ExitCode == 0 {
		t.Fatalf("expected non-zero exit code, got %#v", result)
	}
	if !strings.Contains(result.Output, "boom") {
		t.Fatalf("expected output to contain boom, got %q", result.Output)
	}
}

func TestRunRepoCommandStripsANSISequences(t *testing.T) {
	service := NewService(t.TempDir())

	result, err := service.RunRepoCommand(RepoCommandRequest{
		RepoPath: t.TempDir(),
		Command:  ansiShellCommand(),
	})
	if err != nil {
		t.Fatalf("expected ansi command to run, got %v", err)
	}
	if result.Output != "Build Options" {
		t.Fatalf("expected cleaned output, got %q", result.Output)
	}
	if strings.Contains(result.Output, "\x1b") || strings.Contains(result.Output, "[1;33m") {
		t.Fatalf("expected ansi control codes to be removed, got %q", result.Output)
	}
}

func TestRunRepoCommandStripsControlStrings(t *testing.T) {
	service := NewService(t.TempDir())

	result, err := service.RunRepoCommand(RepoCommandRequest{
		RepoPath: t.TempDir(),
		Command:  controlStringShellCommand(),
	})
	if err != nil {
		t.Fatalf("expected control string command to run, got %v", err)
	}
	if result.Output != "AB" {
		t.Fatalf("expected control string payload to be removed, got %q", result.Output)
	}
}

func TestStreamRepoCommandStripsANSISequences(t *testing.T) {
	service := NewService(t.TempDir())
	var output strings.Builder

	result, err := service.StreamRepoCommand(RepoCommandRequest{
		RepoPath: t.TempDir(),
		Command:  ansiShellCommand(),
	}, func(chunk string) {
		output.WriteString(chunk)
	})
	if err != nil {
		t.Fatalf("expected ansi command to stream, got %v", err)
	}
	if result.ExitCode != 0 {
		t.Fatalf("expected exit code 0, got %#v", result)
	}
	if strings.TrimRight(output.String(), "\r\n") != "Build Options" {
		t.Fatalf("expected cleaned streamed output, got %q", output.String())
	}
}

func TestOutputTruncationKeepsUTF8Boundaries(t *testing.T) {
	value := "甲乙"
	for limit := 1; limit < len(value); limit++ {
		prefix := truncateUTF8Prefix(value, limit)
		suffix := truncateUTF8Suffix(value, limit)
		if len(prefix) > limit || !utf8.ValidString(prefix) {
			t.Fatalf("expected UTF-8-safe prefix at %d bytes, got %q", limit, prefix)
		}
		if len(suffix) > limit || !utf8.ValidString(suffix) {
			t.Fatalf("expected UTF-8-safe suffix at %d bytes, got %q", limit, suffix)
		}
	}
}

func TestCapturedCommandOutputIsBoundedAndMarked(t *testing.T) {
	builder := &cappedStringBuilder{maxBytes: 64}
	builder.WriteString(strings.Repeat("a", 64))
	builder.WriteString("ghi")

	got := builder.stringWithTruncationMarker()
	if len(got) > 64 || !strings.HasSuffix(got, "ghi\n...[命令输出已截断]") {
		t.Fatalf("expected bounded tail with marker, got %q", got)
	}
}

func TestAnsiStripperHandlesSplitSequences(t *testing.T) {
	stripper := ansiStripper{}
	chunks := []string{"\x1b[1;", "33mBuild", " Options\x1b", "[0m"}
	var output strings.Builder
	for _, chunk := range chunks {
		output.WriteString(stripper.Write(chunk))
	}
	if output.String() != "Build Options" {
		t.Fatalf("expected split ansi sequence to be removed, got %q", output.String())
	}
}

func TestAnsiStripperHandlesSplitControlStrings(t *testing.T) {
	stripper := ansiStripper{}
	chunks := []string{"A\x1bPse", "cret\x1b", "\\B"}
	var output strings.Builder
	for _, chunk := range chunks {
		output.WriteString(stripper.Write(chunk))
	}
	if output.String() != "AB" {
		t.Fatalf("expected split control string to be removed, got %q", output.String())
	}
}

func TestRunRepoCommandRejectsMissingPath(t *testing.T) {
	service := NewService(t.TempDir())

	_, err := service.RunRepoCommand(RepoCommandRequest{
		RepoPath: "",
		Command:  successShellCommand(),
	})
	if err == nil {
		t.Fatal("expected missing path error")
	}
}

// Rule: 自定义命令不受 git 的“操作超时”约束，必须跑到自然结束。
func TestRunRepoCommandRunsToCompletionWithoutTimeout(t *testing.T) {
	service := NewService(t.TempDir())
	result, err := service.RunRepoCommand(RepoCommandRequest{
		RepoPath: t.TempDir(),
		Command:  slowShellCommand(),
	})
	if err != nil {
		t.Fatalf("expected command to finish, got err=%v", err)
	}
	if result.ExitCode != 0 {
		t.Fatalf("expected exit code 0, got %#v", result)
	}
}

// Flow: 命令在后台阻塞运行时，终止必须让它真的返回而不是只停止显示。
func TestStopRepoCommandTerminatesRunningCommand(t *testing.T) {
	repoPath := t.TempDir()
	service := NewService(t.TempDir())
	streamID := "cmd-stop-test"
	type outcome struct {
		result RepoCommandResult
		err    error
	}
	results := make(chan outcome, 1)

	go func() {
		result, err := service.RunRepoCommand(RepoCommandRequest{
			RepoPath: repoPath,
			Command:  slowShellCommand(),
			StreamID: streamID,
		})
		results <- outcome{result: result, err: err}
	}()

	waitForRegisteredCommand(t, service.commands, streamID)
	if err := service.StopRepoCommand(streamID); err != nil {
		t.Fatalf("stop running command: %v", err)
	}

	select {
	case got := <-results:
		if got.err != nil {
			t.Fatalf("expected terminated command to return a result, got err=%v", got.err)
		}
		if got.result.ExitCode == 0 {
			t.Fatalf("expected non-zero exit code after termination, got %#v", got.result)
		}
	case <-time.After(10 * time.Second):
		t.Fatal("expected terminated command to return")
	}
}

func TestStopRepoCommandRejectsUnknownStream(t *testing.T) {
	service := NewService(t.TempDir())
	if err := service.StopRepoCommand("missing-stream"); err == nil {
		t.Fatal("expected error for unknown stream id")
	}
	if err := service.StopRepoCommand("   "); err == nil {
		t.Fatal("expected error for blank stream id")
	}
}

func waitForRegisteredCommand(t *testing.T, registry *commandRegistry, streamID string) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		registry.mu.Lock()
		_, ok := registry.running[streamID]
		registry.mu.Unlock()
		if ok {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatal("expected command to be registered before termination")
}

func TestResolveWindowsCommandShellPrefersPwsh(t *testing.T) {
	t.Parallel()

	pwshPath := filepath.Join(`C:\Program Files\PowerShell\7`, "pwsh.exe")
	shell := resolveWindowsCommandShell(func(command string) (string, error) {
		if command == "pwsh.exe" {
			return pwshPath, nil
		}
		return "", errors.New("not found")
	})

	if shell != pwshPath {
		t.Fatalf("expected pwsh path %q, got %q", pwshPath, shell)
	}
}

func TestResolveWindowsCommandShellUsesWindowsPowerShellWhenPwshUnavailable(t *testing.T) {
	t.Parallel()

	shell := resolveWindowsCommandShell(func(string) (string, error) {
		return "", errors.New("not found")
	})

	if shell != "powershell.exe" {
		t.Fatalf("expected Windows PowerShell, got %q", shell)
	}
}

func successShellCommand() string {
	if runtime.GOOS == "windows" {
		return "Write-Output 'hello'"
	}
	return "printf 'hello\\n'"
}

func failingShellCommand() string {
	if runtime.GOOS == "windows" {
		return "Write-Output 'boom'; exit 7"
	}
	return "printf 'boom\\n'; exit 7"
}

func multilineShellCommand() string {
	if runtime.GOOS == "windows" {
		return "Write-Output 'first'\nWrite-Output 'second'"
	}
	return "printf 'first\\n'\nprintf 'second\\n'"
}

func ansiShellCommand() string {
	if runtime.GOOS == "windows" {
		return "Write-Output \"$([char]27)[1;33mBuild Options$([char]27)[0m\""
	}
	return "printf '\\033[1;33mBuild Options\\033[0m\\n'"
}

func controlStringShellCommand() string {
	if runtime.GOOS == "windows" {
		return "Write-Output \"A$([char]27)Psecret$([char]27)\\B\""
	}
	return "printf 'A\\033Psecret\\033\\\\B\\n'"
}

func slowShellCommand() string {
	if runtime.GOOS == "windows" {
		return "Start-Sleep -Seconds 3"
	}
	return "sleep 3"
}

func TestWaitForCommandReportsTerminationFailure(t *testing.T) {
	originalKill := terminateCommandTree
	originalGrace := commandKillGracePeriod
	terminateCommandTree = func(cmd *exec.Cmd) error { return errors.New("kill blocked") }
	commandKillGracePeriod = 200 * time.Millisecond
	defer func() {
		terminateCommandTree = originalKill
		commandKillGracePeriod = originalGrace
	}()

	cmd := buildShellCommand(t.TempDir(), slowShellCommand())
	if err := cmd.Start(); err != nil {
		t.Fatalf("start command: %v", err)
	}
	_, timedOut := waitForCommand(cmd, 100*time.Millisecond)
	if !timedOut {
		t.Fatal("expected timeout")
	}
	_ = cmd.Process.Kill()
	_ = cmd.Wait()
}
