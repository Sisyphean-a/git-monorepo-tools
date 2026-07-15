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

func TestGetFileDiffShowsUnstagedOnlyTrackedChange(t *testing.T) {
	root := t.TempDir()
	repoPath := filepath.Join(root, "repo")
	initTestRepo(t, repoPath)
	commitTestFile(t, repoPath, "tracked.txt", "base\n", "init")
	writeTestFile(t, repoPath, "tracked.txt", "base\nworktree\n")

	service, repoID, request := buildFileDiffFixture(t, root)
	diff, err := service.GetFileDiff(FileDiffRequest{
		RepoID: repoID, Snapshot: request, FilePath: "tracked.txt",
	})
	if err != nil {
		t.Fatalf("get unstaged-only diff: %v", err)
	}
	if !strings.Contains(diff.Content, "+worktree") {
		t.Fatalf("unexpected unstaged-only diff: %q", diff.Content)
	}
}

func TestGetFileDiffShowsStagedOnlyTrackedChange(t *testing.T) {
	root := t.TempDir()
	repoPath := filepath.Join(root, "repo")
	initTestRepo(t, repoPath)
	commitTestFile(t, repoPath, "tracked.txt", "base\n", "init")
	writeTestFile(t, repoPath, "tracked.txt", "base\nstaged\n")
	runTestGit(t, repoPath, "add", "tracked.txt")

	service, repoID, request := buildFileDiffFixture(t, root)
	diff, err := service.GetFileDiff(FileDiffRequest{
		RepoID: repoID, Snapshot: request, FilePath: "tracked.txt", Staged: true,
	})
	if err != nil {
		t.Fatalf("get staged-only diff: %v", err)
	}
	if !strings.Contains(diff.Content, "+staged") {
		t.Fatalf("unexpected staged-only diff: %q", diff.Content)
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

func TestGetFileDiffRejectsPathTraversal(t *testing.T) {
	root := t.TempDir()
	repoPath := filepath.Join(root, "repo")
	initTestRepo(t, repoPath)
	commitTestFile(t, repoPath, "tracked.txt", "base\n", "init")

	service, repoID, request := buildFileDiffFixture(t, root)
	if _, err := service.GetFileDiff(FileDiffRequest{RepoID: repoID, Snapshot: request, FilePath: "../outside.txt"}); err == nil {
		t.Fatal("expected unknown file diff to fail")
	}
}

func TestGetFileDiffRejectsRepositoryInternalFile(t *testing.T) {
	root := t.TempDir()
	repoPath := filepath.Join(root, "repo")
	initTestRepo(t, repoPath)
	commitTestFile(t, repoPath, "tracked.txt", "base\n", "init")

	service, repoID, request := buildFileDiffFixture(t, root)
	_, err := service.GetFileDiff(FileDiffRequest{
		RepoID: repoID, Snapshot: request, FilePath: ".git/config",
	})
	if err == nil || !strings.Contains(err.Error(), "未找到当前变更") {
		t.Fatalf("expected repository internal file to be rejected, got %v", err)
	}
}

func TestGetFileDiffRejectsIgnoredFile(t *testing.T) {
	root := t.TempDir()
	repoPath := filepath.Join(root, "repo")
	initTestRepo(t, repoPath)
	commitTestFile(t, repoPath, ".gitignore", "secret.env\n", "ignore secrets")
	writeTestFile(t, repoPath, "secret.env", "local-secret\n")

	service, repoID, request := buildFileDiffFixture(t, root)
	_, err := service.GetFileDiff(FileDiffRequest{
		RepoID: repoID, Snapshot: request, FilePath: "secret.env",
	})
	if err == nil || !strings.Contains(err.Error(), "未找到当前变更") {
		t.Fatalf("expected ignored file to be rejected, got %v", err)
	}
}

func TestGetFileDiffRejectsUnchangedTrackedFile(t *testing.T) {
	root := t.TempDir()
	repoPath := filepath.Join(root, "repo")
	initTestRepo(t, repoPath)
	commitTestFile(t, repoPath, "tracked.txt", "base\n", "init")

	service, repoID, request := buildFileDiffFixture(t, root)
	_, err := service.GetFileDiff(FileDiffRequest{
		RepoID: repoID, Snapshot: request, FilePath: "tracked.txt",
	})
	if err == nil || !strings.Contains(err.Error(), "未找到当前变更") {
		t.Fatalf("expected unchanged file to be rejected, got %v", err)
	}
}

func TestGetFileDiffRejectsMismatchedStage(t *testing.T) {
	root := t.TempDir()
	repoPath := filepath.Join(root, "repo")
	initTestRepo(t, repoPath)
	commitTestFile(t, repoPath, "tracked.txt", "base\n", "init")
	writeTestFile(t, repoPath, "tracked.txt", "base\nworktree\n")

	service, repoID, request := buildFileDiffFixture(t, root)
	_, err := service.GetFileDiff(FileDiffRequest{
		RepoID: repoID, Snapshot: request, FilePath: "tracked.txt", Staged: true,
	})
	if err == nil || !strings.Contains(err.Error(), "未找到当前变更") {
		t.Fatalf("expected mismatched stage to be rejected, got %v", err)
	}
}

func TestGetFileDiffTreatsSpecialFileNameLiterally(t *testing.T) {
	root := t.TempDir()
	repoPath := filepath.Join(root, "repo")
	initTestRepo(t, repoPath)
	commitTestFile(t, repoPath, "a[1].txt", "base\n", "init")
	writeTestFile(t, repoPath, "a[1].txt", "base\nliteral\n")

	service, repoID, request := buildFileDiffFixture(t, root)
	diff, err := service.GetFileDiff(FileDiffRequest{
		RepoID: repoID, Snapshot: request, FilePath: "a[1].txt",
	})
	if err != nil {
		t.Fatalf("get literal-path diff: %v", err)
	}
	if !strings.Contains(diff.Content, "+literal") {
		t.Fatalf("unexpected literal-path diff: %q", diff.Content)
	}
}

func TestGetFileDiffRejectsWildcardPathspec(t *testing.T) {
	root := t.TempDir()
	repoPath := filepath.Join(root, "repo")
	initTestRepo(t, repoPath)
	commitTestFile(t, repoPath, "tracked.txt", "base\n", "init")
	writeTestFile(t, repoPath, "tracked.txt", "base\nworktree\n")

	service, repoID, request := buildFileDiffFixture(t, root)
	_, err := service.GetFileDiff(FileDiffRequest{
		RepoID: repoID, Snapshot: request, FilePath: "*.txt",
	})
	if err == nil || !strings.Contains(err.Error(), "未找到当前变更") {
		t.Fatalf("expected wildcard pathspec to be rejected, got %v", err)
	}
}

func TestGetFileDiffRejectsDirectoryPath(t *testing.T) {
	root := t.TempDir()
	repoPath := filepath.Join(root, "repo")
	initTestRepo(t, repoPath)
	if err := os.MkdirAll(filepath.Join(repoPath, "nested"), 0o755); err != nil {
		t.Fatalf("create nested directory: %v", err)
	}
	commitTestFile(t, repoPath, "nested/one.txt", "one\n", "add nested files")
	commitTestFile(t, repoPath, "nested/two.txt", "two\n", "add second nested file")
	writeTestFile(t, repoPath, "nested/one.txt", "one\nchanged\n")

	service, repoID, request := buildFileDiffFixture(t, root)
	if _, err := service.GetFileDiff(FileDiffRequest{
		RepoID: repoID, Snapshot: request, FilePath: "nested",
	}); err == nil || !strings.Contains(err.Error(), "未找到当前变更") {
		t.Fatalf("expected directory path to be rejected, got %v", err)
	}
	diff, err := service.GetFileDiff(FileDiffRequest{
		RepoID: repoID, Snapshot: request, FilePath: "nested/one.txt",
	})
	if err != nil || !strings.Contains(diff.Content, "+changed") {
		t.Fatalf("expected exact file diff, got %v, %q", err, diff.Content)
	}

	writeTestFile(t, repoPath, "nested/two.txt", "two\nchanged\n")
	if _, err := service.GetFileDiff(FileDiffRequest{
		RepoID: repoID, Snapshot: request, FilePath: "nested",
	}); err == nil || !strings.Contains(err.Error(), "未找到当前变更") {
		t.Fatalf("expected multi-file directory path to be rejected, got %v", err)
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
