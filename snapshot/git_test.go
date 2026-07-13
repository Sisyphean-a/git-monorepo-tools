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

func TestBuildRepoSnapshotListsEveryChangedFile(t *testing.T) {
	repoPath := t.TempDir()
	initTestRepo(t, repoPath)
	if _, err := runGitStrict(repoPath, []string{"config", "status.showUntrackedFiles", "no"}); err != nil {
		t.Fatalf("disable untracked files in repo config: %v", err)
	}
	commitTestFile(t, repoPath, "tracked.txt", "before\n", "seed")
	if err := os.WriteFile(filepath.Join(repoPath, "tracked.txt"), []byte("before\nafter\n"), 0o644); err != nil {
		t.Fatalf("modify tracked file: %v", err)
	}
	files := map[string]string{
		"generated/evidence.json":             "{}\n",
		"generated/public-issue-context.json": "{}\n",
		"generated/triage.json":               "{}\n",
		"generated/report.md":                 "report\n",
	}
	for relativePath, content := range files {
		absolutePath := filepath.Join(repoPath, filepath.FromSlash(relativePath))
		if err := os.MkdirAll(filepath.Dir(absolutePath), 0o755); err != nil {
			t.Fatalf("create parent directory: %v", err)
		}
		if err := os.WriteFile(absolutePath, []byte(content), 0o644); err != nil {
			t.Fatalf("write untracked file: %v", err)
		}
	}

	snapshot, err := defaultGitExecutor().buildRepoSnapshot(
		repoEntry{repoPath: repoPath, category: "测试"},
		time.Unix(0, 0),
	)
	if err != nil {
		t.Fatalf("build repo snapshot: %v", err)
	}
	expected := map[string]bool{"tracked.txt": true}
	for relativePath := range files {
		expected[relativePath] = true
	}
	if len(snapshot.detail.Files) != len(expected) {
		t.Fatalf("expected %d file changes, got %#v", len(expected), snapshot.detail.Files)
	}
	for _, change := range snapshot.detail.Files {
		if !expected[change.Path] {
			t.Fatalf("unexpected change path %q", change.Path)
		}
		if change.Staged {
			t.Fatalf("expected unstaged file, got %#v", change)
		}
	}
	if snapshot.repo.Modified != len(expected) || snapshot.detail.UnstagedCount != len(expected) {
		t.Fatalf("expected file-level counts, got repo=%d unstaged=%d", snapshot.repo.Modified, snapshot.detail.UnstagedCount)
	}
}
