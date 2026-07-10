package snapshot

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

func TestRunGitTimeoutStopsChildProcess(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("child process tree verification runs on Windows")
	}

	markerPath := filepath.Join(t.TempDir(), "git-child-ran.txt")
	childCommand := encodePowerShellCommand(delayedMarkerScript(markerPath))
	parentScript := fmt.Sprintf("Start-Process powershell.exe -ArgumentList '-NoLogo -NoProfile -NonInteractive -EncodedCommand %s'; Start-Sleep -Seconds 3", childCommand)
	_, err := (gitExecutor{timeout: time.Second}).runGitCommand("powershell.exe", parentScript, nil)
	if err == nil || !strings.Contains(err.Error(), "超时") {
		t.Fatalf("expected timeout error, got %v", err)
	}

	time.Sleep(2500 * time.Millisecond)
	if _, err := os.Stat(markerPath); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("expected git child process to be terminated, stat error=%v", err)
	}
}

func TestRefreshRemoteWithRetryRetriesImmediatelyAndAfterDelay(t *testing.T) {
	originalFetch := runRemoteFetch
	originalSleep := sleepForRemoteFetchRetry
	originalDelays := remoteFetchRetryDelays
	t.Cleanup(func() {
		runRemoteFetch = originalFetch
		sleepForRemoteFetchRetry = originalSleep
		remoteFetchRetryDelays = originalDelays
	})

	attempts := 0
	sleeps := []time.Duration{}
	runRemoteFetch = func(_ gitExecutor, repoPath, remote string) error {
		attempts++
		if attempts < 3 {
			return errors.New("handshake failed")
		}
		return nil
	}
	sleepForRemoteFetchRetry = func(delay time.Duration) {
		sleeps = append(sleeps, delay)
	}
	remoteFetchRetryDelays = []time.Duration{0, 0, 5 * time.Second}

	if err := defaultGitExecutor().refreshRemoteWithRetry("repo", "origin"); err != nil {
		t.Fatalf("expected retry to recover, got %v", err)
	}
	if attempts != 3 {
		t.Fatalf("expected 3 fetch attempts, got %d", attempts)
	}
	if len(sleeps) != 1 || sleeps[0] != 5*time.Second {
		t.Fatalf("expected one delayed retry after 5s, got %#v", sleeps)
	}
}

func TestRefreshRemoteWithRetryReturnsLastFailure(t *testing.T) {
	originalFetch := runRemoteFetch
	originalSleep := sleepForRemoteFetchRetry
	originalDelays := remoteFetchRetryDelays
	t.Cleanup(func() {
		runRemoteFetch = originalFetch
		sleepForRemoteFetchRetry = originalSleep
		remoteFetchRetryDelays = originalDelays
	})

	lastErr := errors.New("still failing")
	attempts := 0
	sleeps := []time.Duration{}
	runRemoteFetch = func(_ gitExecutor, repoPath, remote string) error {
		attempts++
		return lastErr
	}
	sleepForRemoteFetchRetry = func(delay time.Duration) {
		sleeps = append(sleeps, delay)
	}
	remoteFetchRetryDelays = []time.Duration{0, 0, 5 * time.Second}

	err := defaultGitExecutor().refreshRemoteWithRetry("repo", "origin")
	if !errors.Is(err, lastErr) {
		t.Fatalf("expected last fetch error, got %v", err)
	}
	if attempts != 3 {
		t.Fatalf("expected 3 fetch attempts, got %d", attempts)
	}
	if len(sleeps) != 1 || sleeps[0] != 5*time.Second {
		t.Fatalf("expected one delayed retry after 5s, got %#v", sleeps)
	}
}

func TestBuildUntrackedChangesKeepsDirectoryWithoutExpandingFiles(t *testing.T) {
	repoPath := t.TempDir()
	directoryPath := filepath.Join(repoPath, "generated")
	if err := os.MkdirAll(directoryPath, 0o755); err != nil {
		t.Fatalf("create directory: %v", err)
	}
	if err := os.WriteFile(filepath.Join(directoryPath, "nested.txt"), []byte("one\ntwo\n"), 0o644); err != nil {
		t.Fatalf("write nested file: %v", err)
	}

	changes := buildUntrackedChanges(repoPath, []string{"?? generated/"}, nil)
	if len(changes) != 1 {
		t.Fatalf("expected one directory change, got %#v", changes)
	}
	change := changes[0]
	if change.Path != "generated/" {
		t.Fatalf("expected directory path, got %q", change.Path)
	}
	if change.Additions != 0 || change.Size != "—" {
		t.Fatalf("expected no nested file statistics, got %#v", change)
	}
}
