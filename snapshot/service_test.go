package snapshot

import (
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
