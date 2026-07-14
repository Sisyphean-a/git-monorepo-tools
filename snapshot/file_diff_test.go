package snapshot

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestGetFileDiffSeparatesStagedAndUnstagedChanges(t *testing.T) {
	root := t.TempDir()
	repoPath := filepath.Join(root, "repo")
	initTestRepo(t, repoPath)
	commitTestFile(t, repoPath, "tracked.txt", "base\n", "init")
	writeTestFile(t, repoPath, "tracked.txt", "base\nstaged\n")
	runTestGit(t, repoPath, "add", "tracked.txt")
	writeTestFile(t, repoPath, "tracked.txt", "base\nstaged\nworktree\n")

	service, repoID, request := buildFileDiffFixture(t, root)
	staged, err := service.GetFileDiff(FileDiffRequest{RepoID: repoID, Snapshot: request, FilePath: "tracked.txt", Staged: true})
	if err != nil {
		t.Fatalf("get staged diff: %v", err)
	}
	if !strings.Contains(staged.Content, "+staged") || strings.Contains(staged.Content, "+worktree") {
		t.Fatalf("unexpected staged diff: %q", staged.Content)
	}

	unstaged, err := service.GetFileDiff(FileDiffRequest{RepoID: repoID, Snapshot: request, FilePath: "tracked.txt"})
	if err != nil {
		t.Fatalf("get unstaged diff: %v", err)
	}
	if !strings.Contains(unstaged.Content, "+worktree") || strings.Contains(unstaged.Content, "+staged") {
		t.Fatalf("unexpected unstaged diff: %q", unstaged.Content)
	}
}

func TestGetFileDiffShowsUntrackedFileAsAddition(t *testing.T) {
	root := t.TempDir()
	repoPath := filepath.Join(root, "repo")
	initTestRepo(t, repoPath)
	commitTestFile(t, repoPath, "tracked.txt", "base\n", "init")
	writeTestFile(t, repoPath, "new.txt", "first\nsecond\n")

	service, repoID, request := buildFileDiffFixture(t, root)
	diff, err := service.GetFileDiff(FileDiffRequest{RepoID: repoID, Snapshot: request, FilePath: "new.txt"})
	if err != nil {
		t.Fatalf("get untracked diff: %v", err)
	}
	if !strings.Contains(diff.Content, "--- /dev/null") || !strings.Contains(diff.Content, "+first") {
		t.Fatalf("unexpected untracked diff: %q", diff.Content)
	}
}

func TestGetFileDiffRejectsFilesOutsideCurrentChanges(t *testing.T) {
	root := t.TempDir()
	repoPath := filepath.Join(root, "repo")
	initTestRepo(t, repoPath)
	commitTestFile(t, repoPath, "tracked.txt", "base\n", "init")

	service, repoID, request := buildFileDiffFixture(t, root)
	if _, err := service.GetFileDiff(FileDiffRequest{RepoID: repoID, Snapshot: request, FilePath: "../outside.txt"}); err == nil {
		t.Fatal("expected unknown file diff to fail")
	}
}

func buildFileDiffFixture(t *testing.T, root string) (*Service, string, Request) {
	t.Helper()
	service := NewService(root)
	request := Request{ScanRoots: []ScanRoot{{Path: root, Category: "测试"}}}
	snapshot, err := service.BuildAppSnapshot(request)
	if err != nil {
		t.Fatalf("build snapshot: %v", err)
	}
	if len(snapshot.Repos) != 1 {
		t.Fatalf("expected one repo, got %d", len(snapshot.Repos))
	}
	return service, snapshot.Repos[0].ID, request
}

func writeTestFile(t *testing.T, repoPath, name, content string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(repoPath, name), []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", name, err)
	}
}

func runTestGit(t *testing.T, repoPath string, args ...string) {
	t.Helper()
	if _, err := runGitStrict(repoPath, args); err != nil {
		t.Fatalf("git %s: %v", strings.Join(args, " "), err)
	}
}
