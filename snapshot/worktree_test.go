package snapshot

import (
	"os"
	"path/filepath"
	"testing"
)

func TestResolveWorktreeIdentityGroupsLinkedWorktreeWithMainRepo(t *testing.T) {
	root := t.TempDir()
	mainPath := filepath.Join(root, "my-repo")
	worktreePath := filepath.Join(root, "feat-x")
	initTestRepo(t, mainPath)
	commitTestFile(t, mainPath, "README.md", "init\n", "init")
	runTestGit(t, mainPath, "worktree", "add", "-b", "feat/x", worktreePath)

	mainIdentity := resolveWorktreeIdentity(mainPath)
	linkedIdentity := resolveWorktreeIdentity(worktreePath)

	if mainIdentity.GroupID == "" || linkedIdentity.GroupID == "" {
		t.Fatalf("expected non-empty worktree group ids: %#v %#v", mainIdentity, linkedIdentity)
	}
	if mainIdentity.GroupID != linkedIdentity.GroupID {
		t.Fatalf("expected linked worktree to share group id, got %q and %q", mainIdentity.GroupID, linkedIdentity.GroupID)
	}
	if !mainIdentity.IsMain {
		t.Fatalf("expected main worktree flag, got %#v", mainIdentity)
	}
	if linkedIdentity.IsMain {
		t.Fatalf("expected linked worktree not to be main, got %#v", linkedIdentity)
	}
	if mainIdentity.GroupName != "my-repo" || linkedIdentity.GroupName != "my-repo" {
		t.Fatalf("expected group name from main repo, got %q and %q", mainIdentity.GroupName, linkedIdentity.GroupName)
	}
}

func TestResolveWorktreeIdentityReadsSeparateGitDir(t *testing.T) {
	root := t.TempDir()
	repoPath := filepath.Join(root, "repo")
	gitDir := filepath.Join(root, "store.git")
	if err := os.MkdirAll(repoPath, 0o755); err != nil {
		t.Fatalf("create repo dir: %v", err)
	}
	if _, err := runGitStrict(root, []string{"init", "--separate-git-dir", gitDir, repoPath}); err != nil {
		t.Fatalf("init separate git dir: %v", err)
	}

	identity := resolveWorktreeIdentity(repoPath)

	if !identity.IsMain {
		t.Fatalf("separate git dir repo must be a main worktree: %#v", identity)
	}
	if identity.GroupName != "store" {
		t.Fatalf("expected group name from separate git dir, got %q", identity.GroupName)
	}
	if identity.GroupID == "" {
		t.Fatal("expected non-empty group id")
	}
}

func TestResolveWorktreeIdentityKeepsIndependentReposSeparate(t *testing.T) {
	root := t.TempDir()
	first := filepath.Join(root, "repo-a")
	second := filepath.Join(root, "repo-b")
	initTestRepo(t, first)
	initTestRepo(t, second)

	firstIdentity := resolveWorktreeIdentity(first)
	secondIdentity := resolveWorktreeIdentity(second)

	if firstIdentity.GroupID == secondIdentity.GroupID {
		t.Fatalf("independent repos must not share group id: %q", firstIdentity.GroupID)
	}
	if !firstIdentity.IsMain || !secondIdentity.IsMain {
		t.Fatalf("standalone repos must be main worktrees: %#v %#v", firstIdentity, secondIdentity)
	}
}

func TestBuildWorkspaceBootstrapCarriesWorktreeGroups(t *testing.T) {
	root := t.TempDir()
	mainPath := filepath.Join(root, "my-repo")
	worktreePath := filepath.Join(root, "feat-x")
	initTestRepo(t, mainPath)
	commitTestFile(t, mainPath, "README.md", "init\n", "init")
	runTestGit(t, mainPath, "worktree", "add", "-b", "feat/x", worktreePath)

	bootstrap, err := NewService(root).BuildWorkspaceBootstrap(Request{
		ScanRoots: []ScanRoot{{Path: root, Category: "测试"}},
	})
	if err != nil {
		t.Fatalf("build bootstrap: %v", err)
	}
	if len(bootstrap.Repos) != 2 {
		t.Fatalf("expected main repo and worktree, got %#v", bootstrap.Repos)
	}

	byName := map[string]Repo{}
	for _, repo := range bootstrap.Repos {
		byName[repo.Name] = repo
	}
	mainRepo, mainOK := byName["my-repo"]
	linkedRepo, linkedOK := byName["feat-x"]
	if !mainOK || !linkedOK {
		t.Fatalf("expected both worktrees in bootstrap, got %#v", byName)
	}
	if mainRepo.WorktreeGroupID == "" || mainRepo.WorktreeGroupID != linkedRepo.WorktreeGroupID {
		t.Fatalf("bootstrap must carry shared group id: %#v %#v", mainRepo, linkedRepo)
	}
	if !mainRepo.IsMainWorktree || linkedRepo.IsMainWorktree {
		t.Fatalf("bootstrap must carry main worktree flags: %#v %#v", mainRepo, linkedRepo)
	}
	if mainRepo.WorktreeGroupName != "my-repo" || linkedRepo.WorktreeGroupName != "my-repo" {
		t.Fatalf("bootstrap must carry group name: %#v %#v", mainRepo, linkedRepo)
	}

	// Rule: 单仓刷新走 repoPath 提示时也必须重新带上分组字段，不能把工作树移出原组。
	refresh, err := NewService(root).BuildRepoSnapshot(repoIDForPath(worktreePath), Request{
		RepoPath: worktreePath, RepoCategory: "测试",
	}, false)
	if err != nil {
		t.Fatalf("refresh worktree snapshot: %v", err)
	}
	if refresh.Repo.WorktreeGroupID != mainRepo.WorktreeGroupID || refresh.Repo.WorktreeGroupName != "my-repo" || refresh.Repo.IsMainWorktree {
		t.Fatalf("hinted refresh must keep worktree identity: %#v", refresh.Repo.Repo)
	}
}
