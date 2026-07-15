package terminal

import (
	"os"
	"path/filepath"
	"testing"
)

func TestSameTerminalRepoTreatsCaseAliasAsSameDirectoryWhenFilesystemAllows(t *testing.T) {
	root := t.TempDir()
	repoPath := filepath.Join(root, "RepoCase")
	if err := os.Mkdir(repoPath, 0o755); err != nil {
		t.Fatalf("mkdir repo path: %v", err)
	}

	aliasPath := filepath.Join(root, "repocase")
	repoInfo, err := os.Stat(repoPath)
	if err != nil {
		t.Fatalf("stat repo path: %v", err)
	}
	aliasInfo, err := os.Stat(aliasPath)
	if err != nil {
		t.Skip("filesystem keeps case-sensitive directory entries for this path")
	}

	if !sameTerminalRepo(repoPath, repoInfo, aliasPath, aliasInfo) {
		t.Fatalf("expected same repo for case alias: %q vs %q", repoPath, aliasPath)
	}
}

func TestSameTerminalRepoTreatsSymlinkAliasAsSameDirectory(t *testing.T) {
	root := t.TempDir()
	repoPath := filepath.Join(root, "repo")
	linkPath := filepath.Join(root, "repo-link")
	if err := os.Mkdir(repoPath, 0o755); err != nil {
		t.Fatalf("mkdir repo path: %v", err)
	}
	if err := os.Symlink(repoPath, linkPath); err != nil {
		t.Skipf("symlink unsupported: %v", err)
	}

	repoInfo, err := os.Stat(repoPath)
	if err != nil {
		t.Fatalf("stat repo path: %v", err)
	}
	linkInfo, err := os.Stat(linkPath)
	if err != nil {
		t.Fatalf("stat link path: %v", err)
	}

	if !sameTerminalRepo(repoPath, repoInfo, linkPath, linkInfo) {
		t.Fatalf("expected same repo for symlink alias: %q vs %q", repoPath, linkPath)
	}
}

func TestSameTerminalRepoDistinguishesDifferentDirectories(t *testing.T) {
	leftPath := t.TempDir()
	rightPath := t.TempDir()

	leftInfo, err := os.Stat(leftPath)
	if err != nil {
		t.Fatalf("stat left path: %v", err)
	}
	rightInfo, err := os.Stat(rightPath)
	if err != nil {
		t.Fatalf("stat right path: %v", err)
	}

	if sameTerminalRepo(leftPath, leftInfo, rightPath, rightInfo) {
		t.Fatalf("different repos should not match: %q vs %q", leftPath, rightPath)
	}
}
