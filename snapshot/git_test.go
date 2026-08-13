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

func TestBuildRepoSnapshotClassifiesDeletionOnlyEditsAsModified(t *testing.T) {
	repoPath := t.TempDir()
	initTestRepo(t, repoPath)
	commitTestFile(t, repoPath, "only-deleted-lines.txt", "keep\nremove\n", "seed deletion-only edit")
	commitTestFile(t, repoPath, "staged-deletion-only.txt", "keep\nremove\n", "seed staged deletion-only edit")
	commitTestFile(t, repoPath, "deleted-file.txt", "remove entirely\n", "seed deleted file")

	if err := os.WriteFile(filepath.Join(repoPath, "only-deleted-lines.txt"), []byte("keep\n"), 0o644); err != nil {
		t.Fatalf("delete unstaged line: %v", err)
	}
	if err := os.WriteFile(filepath.Join(repoPath, "staged-deletion-only.txt"), []byte("keep\n"), 0o644); err != nil {
		t.Fatalf("delete staged line: %v", err)
	}
	if _, err := runGitStrict(repoPath, []string{"add", "--", "staged-deletion-only.txt"}); err != nil {
		t.Fatalf("stage deletion-only edit: %v", err)
	}
	if err := os.Remove(filepath.Join(repoPath, "deleted-file.txt")); err != nil {
		t.Fatalf("delete file: %v", err)
	}

	snapshot, err := defaultGitExecutor().buildRepoSnapshot(
		repoEntry{repoPath: repoPath, category: "测试"},
		time.Unix(0, 0),
	)
	if err != nil {
		t.Fatalf("build repo snapshot: %v", err)
	}

	changes := map[string]FileChange{}
	for _, change := range snapshot.detail.Files {
		changes[change.Path] = change
	}
	if len(changes) != 3 {
		t.Fatalf("expected 3 file changes, got %#v", snapshot.detail.Files)
	}
	if change := changes["only-deleted-lines.txt"]; change.Status != "M" || change.Additions != 0 || change.Deletions != 1 || change.Staged {
		t.Fatalf("expected unstaged deletion-only edit to remain modified, got %#v", change)
	}
	if change := changes["staged-deletion-only.txt"]; change.Status != "M" || change.Additions != 0 || change.Deletions != 1 || !change.Staged {
		t.Fatalf("expected staged deletion-only edit to remain modified, got %#v", change)
	}
	if change := changes["deleted-file.txt"]; change.Status != "D" || change.Additions != 0 || change.Deletions != 1 || change.Staged {
		t.Fatalf("expected deleted file to remain deleted, got %#v", change)
	}
}

func TestBuildRepoSnapshotPreservesNonASCIIFilenames(t *testing.T) {
	repoPath := t.TempDir()
	initTestRepo(t, repoPath)

	trackedPath := "已跟踪的中文文档.md"
	untrackedPath := "26包桥接文档和埋点文档.md"
	commitTestFile(t, repoPath, trackedPath, "before\n", "seed")
	if err := os.WriteFile(filepath.Join(repoPath, trackedPath), []byte("before\nafter\n"), 0o644); err != nil {
		t.Fatalf("modify tracked file: %v", err)
	}
	if err := os.WriteFile(filepath.Join(repoPath, untrackedPath), []byte("new\n"), 0o644); err != nil {
		t.Fatalf("write untracked file: %v", err)
	}

	snapshot, err := defaultGitExecutor().buildRepoSnapshot(
		repoEntry{repoPath: repoPath, category: "测试"},
		time.Unix(0, 0),
	)
	if err != nil {
		t.Fatalf("build repo snapshot: %v", err)
	}

	expected := map[string]bool{trackedPath: true, untrackedPath: true}
	if len(snapshot.detail.Files) != len(expected) {
		t.Fatalf("expected %d file changes, got %#v", len(expected), snapshot.detail.Files)
	}
	for _, change := range snapshot.detail.Files {
		if !expected[change.Path] {
			t.Fatalf("expected non-ASCII path, got %#v", change)
		}
		delete(expected, change.Path)
	}
	if len(expected) != 0 {
		t.Fatalf("missing changes for %#v", expected)
	}
}

func TestParseStatusV2CapturesHeadAndNormalizesEntries(t *testing.T) {
	parsed := parseStatus(strings.Join([]string{
		"# branch.oid abc123",
		"# branch.head feature/test",
		"# branch.upstream origin/feature/test",
		"# branch.ab +2 -3",
		"? new.txt",
		"u UU N... 100644 100644 100644 100644 a b c conflict.txt",
	}, "\x00"))

	if parsed.headRevision != "abc123" || parsed.branch != "feature/test" || parsed.remote != "origin" {
		t.Fatalf("unexpected branch metadata: %#v", parsed)
	}
	if parsed.ahead != 2 || parsed.behind != 3 || parsed.conflicts != 1 {
		t.Fatalf("unexpected status counts: %#v", parsed)
	}
	if len(parsed.entries) != 2 || parsed.entries[0] != "?? new.txt" {
		t.Fatalf("unexpected normalized entries: %#v", parsed.entries)
	}
}

func TestExtractBranchPreservesDottedBranchNames(t *testing.T) {
	cases := []struct {
		line string
		want string
	}{
		{"## master...origin/master", "master"},
		{"## release/1.0...origin/release/1.0", "release/1.0"},
		{"## feature/foo-bar...origin/feature/foo-bar [ahead 2]", "feature/foo-bar"},
		{"## HEAD (no branch)", "HEAD"},
		{"## main", "main"},
	}
	for _, test := range cases {
		if got := extractBranch(test.line); got != test.want {
			t.Errorf("extractBranch(%q) = %q, want %q", test.line, got, test.want)
		}
	}
}
