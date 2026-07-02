package snapshot

import (
	"testing"
	"time"
)

func TestResolveRepoFromEntriesLoadsOnlyMatchingRepo(t *testing.T) {
	entries := []repoEntry{
		{repoPath: "E:/workspace/repo-a", category: "测试"},
		{repoPath: "E:/workspace/repo-b", category: "测试"},
	}
	targetPath := normalizePath("E:/workspace/repo-b")
	targetID := repoIDForPath(targetPath)
	calls := []string{}

	repo, err := resolveRepoFromEntries(targetID, entries, time.Unix(0, 0), func(entry repoEntry, scanTime time.Time) (repoSnapshot, error) {
		calls = append(calls, normalizePath(entry.repoPath))
		return repoSnapshot{
			detail: RepoDetail{
				Repo: Repo{
					ID:   repoIDForPath(entry.repoPath),
					Path: normalizePath(entry.repoPath),
				},
			},
		}, nil
	})
	if err != nil {
		t.Fatalf("expected repo to resolve, got %v", err)
	}
	if len(calls) != 1 || calls[0] != targetPath {
		t.Fatalf("expected only target repo to load, got %v", calls)
	}
	if repo.ID != targetID {
		t.Fatalf("expected resolved repo %q, got %q", targetID, repo.ID)
	}
}

func TestResolveRepoFromEntriesSkipsSnapshotLoadWhenRepoIDMissing(t *testing.T) {
	entries := []repoEntry{{repoPath: "E:/workspace/repo-a", category: "测试"}}
	loadCalls := 0

	_, err := resolveRepoFromEntries(repoIDForPath("E:/workspace/repo-b"), entries, time.Unix(0, 0), func(entry repoEntry, scanTime time.Time) (repoSnapshot, error) {
		loadCalls++
		return repoSnapshot{}, nil
	})
	if err == nil {
		t.Fatal("expected missing repo error")
	}
	if loadCalls != 0 {
		t.Fatalf("expected no snapshot loads for non-matching repo id, got %d", loadCalls)
	}
}

func TestResolveRepoPathHintBuildsMinimalRepoForCommit(t *testing.T) {
	repoPath := "E:/workspace/repo-a"
	repoID := repoIDForPath(repoPath)

	repo, ok := resolveRepoPathHint(repoID, "commit", repoPath)
	if !ok {
		t.Fatal("expected commit action to use path hint")
	}
	if repo.Path != normalizePath(repoPath) {
		t.Fatalf("expected normalized repo path %q, got %q", normalizePath(repoPath), repo.Path)
	}
}

func TestResolveRepoPathHintRejectsMismatchedRepoID(t *testing.T) {
	_, ok := resolveRepoPathHint(repoIDForPath("E:/workspace/repo-a"), "commit", "E:/workspace/repo-b")
	if ok {
		t.Fatal("expected mismatched path hint to be rejected")
	}
}

func TestResolveRepoByPathLoadsTargetSnapshot(t *testing.T) {
	targetPath := normalizePath("E:/workspace/repo-a")
	targetID := repoIDForPath(targetPath)
	loadCalls := 0

	repo, err := resolveRepoByPath(targetID, targetPath, time.Unix(0, 0), func(entry repoEntry, scanTime time.Time) (repoSnapshot, error) {
		loadCalls++
		return repoSnapshot{
			repo: Repo{ID: targetID},
			detail: RepoDetail{
				Repo: Repo{ID: targetID, Path: targetPath},
			},
		}, nil
	})
	if err != nil {
		t.Fatalf("expected repo path resolution to succeed, got %v", err)
	}
	if loadCalls != 1 {
		t.Fatalf("expected one snapshot load, got %d", loadCalls)
	}
	if repo.Path != targetPath {
		t.Fatalf("expected resolved repo path %q, got %q", targetPath, repo.Path)
	}
}

func TestResolveRepoForActionWithLoadUsesPathHintForPull(t *testing.T) {
	targetPath := normalizePath("E:/workspace/repo-a")
	targetID := repoIDForPath(targetPath)
	loadCalls := 0
	entries := []repoEntry{{repoPath: "E:/workspace/repo-b", category: "测试"}}

	repo, err := resolveRepoForActionWithLoad(
		targetID,
		"pull",
		RepoActionRequest{RepoPath: targetPath},
		func() []repoEntry { return entries },
		time.Unix(0, 0),
		func(entry repoEntry, scanTime time.Time) (repoSnapshot, error) {
			loadCalls++
			return repoSnapshot{
				repo: Repo{ID: targetID},
				detail: RepoDetail{
					Repo: Repo{ID: targetID, Path: normalizePath(entry.repoPath)},
				},
			}, nil
		},
	)
	if err != nil {
		t.Fatalf("expected pull action to resolve by path hint, got %v", err)
	}
	if loadCalls != 1 {
		t.Fatalf("expected one targeted snapshot load, got %d", loadCalls)
	}
	if repo.Path != targetPath {
		t.Fatalf("expected pull path hint to resolve %q, got %q", targetPath, repo.Path)
	}
}

func TestResolveRepoForActionWithLoadFallsBackToEntriesWhenHintInvalid(t *testing.T) {
	targetPath := normalizePath("E:/workspace/repo-a")
	targetID := repoIDForPath(targetPath)
	loadCalls := []string{}
	entries := []repoEntry{
		{repoPath: targetPath, category: "测试"},
		{repoPath: "E:/workspace/repo-b", category: "测试"},
	}

	repo, err := resolveRepoForActionWithLoad(
		targetID,
		"commit",
		RepoActionRequest{RepoPath: "E:/workspace/repo-b"},
		func() []repoEntry { return entries },
		time.Unix(0, 0),
		func(entry repoEntry, scanTime time.Time) (repoSnapshot, error) {
			loadCalls = append(loadCalls, normalizePath(entry.repoPath))
			return repoSnapshot{
				detail: RepoDetail{
					Repo: Repo{ID: repoIDForPath(entry.repoPath), Path: normalizePath(entry.repoPath)},
				},
			}, nil
		},
	)
	if err != nil {
		t.Fatalf("expected invalid hint to fall back to repo scan, got %v", err)
	}
	if len(loadCalls) != 1 || loadCalls[0] != targetPath {
		t.Fatalf("expected fallback to load only matching entry %q, got %v", targetPath, loadCalls)
	}
	if repo.ID != targetID {
		t.Fatalf("expected fallback repo %q, got %q", targetID, repo.ID)
	}
}

func TestResolveRepoForActionWithLoadSkipsDiscoveryWhenCommitHintValid(t *testing.T) {
	targetPath := normalizePath("E:/workspace/repo-a")
	targetID := repoIDForPath(targetPath)
	discoverCalls := 0
	loadCalls := 0

	repo, err := resolveRepoForActionWithLoad(
		targetID,
		"commit",
		RepoActionRequest{RepoPath: targetPath},
		func() []repoEntry {
			discoverCalls++
			return []repoEntry{{repoPath: "E:/workspace/repo-b", category: "测试"}}
		},
		time.Unix(0, 0),
		func(entry repoEntry, scanTime time.Time) (repoSnapshot, error) {
			loadCalls++
			return repoSnapshot{}, nil
		},
	)
	if err != nil {
		t.Fatalf("expected valid commit hint to resolve without discovery, got %v", err)
	}
	if discoverCalls != 0 {
		t.Fatalf("expected no repo discovery for valid commit hint, got %d", discoverCalls)
	}
	if loadCalls != 0 {
		t.Fatalf("expected no snapshot load for valid commit hint, got %d", loadCalls)
	}
	if repo.Path != targetPath {
		t.Fatalf("expected commit hint path %q, got %q", targetPath, repo.Path)
	}
}
