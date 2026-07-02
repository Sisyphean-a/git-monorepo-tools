package snapshot

import (
	"runtime"
	"strings"
	"testing"
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
