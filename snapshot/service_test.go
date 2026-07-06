package snapshot

import (
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"
)

func TestSortSnapshotsUsesPathAsTieBreaker(t *testing.T) {
	service := NewService("E:/workspace/repo-a")
	items := []repoSnapshot{
		{repo: Repo{Name: "same", Path: "E:/workspace/repo-b", Modified: 1}},
		{repo: Repo{Name: "same", Path: "E:/workspace/repo-a", Modified: 1}},
	}

	sorted := service.sortSnapshots(items)
	if got, want := sorted[0].repo.Path, "E:/workspace/repo-a"; got != want {
		t.Fatalf("expected first repo path %q, got %q", want, got)
	}
	if got, want := sorted[1].repo.Path, "E:/workspace/repo-b"; got != want {
		t.Fatalf("expected second repo path %q, got %q", want, got)
	}
}

func TestRepoStatusMarksScanError(t *testing.T) {
	if got := repoStatus("boom", 0, 0); got != "error" {
		t.Fatalf("expected error status, got %q", got)
	}
}

func TestBuildRootsDoesNotInjectDefaultScanRoots(t *testing.T) {
	service := NewService("E:/workspace/repo-a")

	roots := service.buildRoots(Request{})

	if len(roots) != 0 {
		t.Fatalf("expected no scan roots by default, got %#v", roots)
	}
}

func TestBuildRootsKeepsExplicitRootsOnly(t *testing.T) {
	service := NewService("E:/workspace/repo-a")

	roots := service.buildRoots(Request{
		ScanRoots: []ScanRoot{
			{Path: "E:/Repos", Category: ""},
			{Path: "e:/repos", Category: "重复项"},
			{Path: "E:/Tools", Category: "工具"},
		},
	})

	if len(roots) != 2 {
		t.Fatalf("expected 2 deduped scan roots, got %#v", roots)
	}
	if roots[0].Category != "Repos 工作区" {
		t.Fatalf("expected fallback category for explicit root, got %#v", roots[0])
	}
	if !slices.ContainsFunc(roots, func(root ScanRoot) bool {
		return root.Path == "E:/Tools" && root.Category == "工具"
	}) {
		t.Fatalf("expected explicit categorized root to remain, got %#v", roots)
	}
}

func TestBuildRepoSnapshotMarksScanErrorForGitFailure(t *testing.T) {
	entry := repoEntry{
		repoPath: "E:/definitely/missing/repo",
		category: "测试",
	}

	snapshot, err := buildRepoSnapshot(entry, time.Unix(0, 0))
	if err != nil {
		t.Fatalf("expected no hard error, got %v", err)
	}
	if snapshot.repo.Status != "error" {
		t.Fatalf("expected repo status error, got %q", snapshot.repo.Status)
	}
	if strings.TrimSpace(snapshot.repo.ScanError) == "" {
		t.Fatal("expected scan error message to be populated")
	}
}

func TestBuildRepoSnapshotRefreshesRemoteBeforeReadingBehind(t *testing.T) {
	root := t.TempDir()
	remotePath := filepath.Join(root, "remote.git")
	seedPath := filepath.Join(root, "seed")
	localPath := filepath.Join(root, "local")
	updaterPath := filepath.Join(root, "updater")

	if _, err := runGitStrict(root, []string{"init", "--bare", remotePath}); err != nil {
		t.Fatalf("init bare remote: %v", err)
	}
	initTestRepo(t, seedPath)
	commitTestFile(t, seedPath, "tracked.txt", "base\n", "seed")
	if _, err := runGitStrict(seedPath, []string{"remote", "add", "origin", remotePath}); err != nil {
		t.Fatalf("add remote: %v", err)
	}
	if _, err := runGitStrict(seedPath, []string{"push", "-u", "origin", "HEAD"}); err != nil {
		t.Fatalf("push seed commit: %v", err)
	}
	cloneTestRepo(t, root, remotePath, localPath)
	cloneTestRepo(t, root, remotePath, updaterPath)
	commitTestFile(t, updaterPath, "tracked.txt", "base\nremote\n", "remote change")
	if _, err := runGitStrict(updaterPath, []string{"push"}); err != nil {
		t.Fatalf("push remote change: %v", err)
	}

	before, err := runGitStrict(localPath, []string{"status", "--porcelain=v1", "-b"})
	if err != nil {
		t.Fatalf("read status before snapshot: %v", err)
	}
	if strings.Contains(before, "behind 1") {
		t.Fatalf("expected local clone to be stale before snapshot fetch, got %q", before)
	}

	snapshot, err := buildRepoSnapshotWithRemoteMode(repoEntry{repoPath: localPath, category: "测试"}, time.Unix(0, 0), true)
	if err != nil {
		t.Fatalf("build snapshot: %v", err)
	}
	if snapshot.repo.ScanError != "" {
		t.Fatalf("expected no scan error after remote refresh, got %q", snapshot.repo.ScanError)
	}
	if snapshot.repo.Behind != 1 {
		t.Fatalf("expected behind=1 after remote refresh, got %d", snapshot.repo.Behind)
	}
	if snapshot.repo.Ahead != 0 {
		t.Fatalf("expected ahead=0 after remote refresh, got %d", snapshot.repo.Ahead)
	}

	after, err := runGitStrict(localPath, []string{"status", "--porcelain=v1", "-b"})
	if err != nil {
		t.Fatalf("read status after snapshot: %v", err)
	}
	if !strings.Contains(after, "behind 1") {
		t.Fatalf("expected snapshot refresh to update tracking branch, got %q", after)
	}
}

func initTestRepo(t *testing.T, repoPath string) {
	t.Helper()
	if err := os.MkdirAll(repoPath, 0o755); err != nil {
		t.Fatalf("create repo dir: %v", err)
	}
	if _, err := runGitStrict(repoPath, []string{"init"}); err != nil {
		t.Fatalf("init repo: %v", err)
	}
	if _, err := runGitStrict(repoPath, []string{"config", "user.email", "test@example.com"}); err != nil {
		t.Fatalf("config email: %v", err)
	}
	if _, err := runGitStrict(repoPath, []string{"config", "user.name", "Test User"}); err != nil {
		t.Fatalf("config name: %v", err)
	}
}

func cloneTestRepo(t *testing.T, workdir, remotePath, repoPath string) {
	t.Helper()
	if _, err := runGitStrict(workdir, []string{"clone", remotePath, repoPath}); err != nil {
		t.Fatalf("clone repo: %v", err)
	}
	if _, err := runGitStrict(repoPath, []string{"config", "user.email", "test@example.com"}); err != nil {
		t.Fatalf("config clone email: %v", err)
	}
	if _, err := runGitStrict(repoPath, []string{"config", "user.name", "Test User"}); err != nil {
		t.Fatalf("config clone name: %v", err)
	}
}

func commitTestFile(t *testing.T, repoPath, relativePath, content, message string) {
	t.Helper()
	absolutePath := filepath.Join(repoPath, relativePath)
	if err := os.MkdirAll(filepath.Dir(absolutePath), 0o755); err != nil {
		t.Fatalf("create parent dir: %v", err)
	}
	if err := os.WriteFile(absolutePath, []byte(content), 0o644); err != nil {
		t.Fatalf("write file: %v", err)
	}
	if _, err := runGitStrict(repoPath, []string{"add", "--", relativePath}); err != nil {
		t.Fatalf("stage file: %v", err)
	}
	if _, err := runGitStrict(repoPath, []string{"commit", "-m", message}); err != nil {
		t.Fatalf("commit file: %v", err)
	}
}
