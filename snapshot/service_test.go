package snapshot

import (
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
