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
