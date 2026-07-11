package snapshot

import (
	"errors"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestGetRepoHistoryMarksUnknownTotalWhenMoreCommitsRemain(t *testing.T) {
	root := t.TempDir()
	repoPath := filepath.Join(root, "repo")
	initTestRepo(t, repoPath)
	for index := 0; index < 3; index++ {
		commitTestFile(t, repoPath, "tracked.txt", strings.Repeat("x", index+1)+"\n", "commit")
	}

	service := NewService(root)
	request := Request{ScanRoots: []ScanRoot{{Path: root, Category: "测试"}}}
	snapshot, err := service.BuildAppSnapshot(request)
	if err != nil {
		t.Fatalf("build snapshot: %v", err)
	}
	if len(snapshot.Repos) != 1 {
		t.Fatalf("expected one repo, got %d", len(snapshot.Repos))
	}
	history := snapshot.RepoDetails[snapshot.Repos[0].ID].History
	if history == nil || len(history) != 0 {
		t.Fatal("expected app snapshot to defer commit history")
	}

	page, err := service.GetRepoHistory(snapshot.Repos[0].ID, request, 0, 2)
	if err != nil {
		t.Fatalf("get repo history: %v", err)
	}
	if !page.HasMore {
		t.Fatal("expected more history pages")
	}
	if page.Total != 0 {
		t.Fatalf("expected unknown total while more history remains, got %d", page.Total)
	}
	if len(page.Commits) != 2 {
		t.Fatalf("expected 2 commits, got %d", len(page.Commits))
	}
}

func TestGetRepoHistoryReturnsEmptySliceForRepositoryWithoutCommits(t *testing.T) {
	root := t.TempDir()
	repoPath := filepath.Join(root, "repo")
	initTestRepo(t, repoPath)
	service := NewService(root)
	request := Request{ScanRoots: []ScanRoot{{Path: root, Category: "测试"}}}
	snapshot, err := service.BuildAppSnapshot(request)
	if err != nil {
		t.Fatalf("build snapshot: %v", err)
	}

	page, err := service.GetRepoHistory(snapshot.Repos[0].ID, request, 0, 2)
	if err != nil {
		t.Fatalf("get repo history: %v", err)
	}
	if page.Commits == nil || len(page.Commits) != 0 {
		t.Fatalf("expected empty commits slice, got %#v", page.Commits)
	}
}

func TestGetRepoLogReturnsSummariesWithoutFileStats(t *testing.T) {
	root := t.TempDir()
	repoPath := filepath.Join(root, "repo")
	initTestRepo(t, repoPath)
	commitTestFile(t, repoPath, "large-change.txt", strings.Repeat("x\n", 32), "feat: concise log")

	service := NewService(root)
	request := Request{ScanRoots: []ScanRoot{{Path: root, Category: "测试"}}}
	snapshot, err := service.BuildAppSnapshot(request)
	if err != nil {
		t.Fatalf("build snapshot: %v", err)
	}
	log, err := service.GetRepoLog(snapshot.Repos[0].ID, request)
	if err != nil {
		t.Fatalf("get repo log: %v", err)
	}
	if !strings.Contains(log.Content, "feat: concise log") {
		t.Fatalf("expected commit summary, got %q", log.Content)
	}
	if strings.Contains(log.Content, "large-change.txt") {
		t.Fatalf("expected no file statistics, got %q", log.Content)
	}
}

func TestRunBatchConcurrentHonorsConfiguredWorkerLimit(t *testing.T) {
	states := make([]batchRepoState, 4)
	started := make(chan struct{}, len(states))
	release := make(chan struct{})
	done := make(chan []PullResult, 1)
	var active atomic.Int32
	var peak atomic.Int32

	go func() {
		done <- runBatchConcurrent(states, 2, func(_ batchRepoState) PullResult {
			current := active.Add(1)
			for current > peak.Load() && !peak.CompareAndSwap(peak.Load(), current) {
			}
			started <- struct{}{}
			<-release
			active.Add(-1)
			return PullResult{}
		})
	}()

	<-started
	<-started
	if peak.Load() != 2 {
		t.Fatalf("expected two concurrent batch operations, got %d", peak.Load())
	}
	close(release)
	if results := <-done; len(results) != len(states) {
		t.Fatalf("expected %d results, got %d", len(states), len(results))
	}
}

func TestSortBatchStatesMatchesSnapshotOrder(t *testing.T) {
	service := NewService("E:/workspace/pinned")
	states := []batchRepoState{
		{detail: RepoDetail{Repo: Repo{Name: "zeta", Path: "E:/workspace/zeta", Modified: 1}}},
		{detail: RepoDetail{Repo: Repo{Name: "pinned", Path: "E:/workspace/pinned"}}},
		{detail: RepoDetail{Repo: Repo{Name: "alpha", Path: "E:/workspace/alpha", Modified: 1}}},
	}

	sorted := service.sortBatchStates(states)
	paths := []string{sorted[0].detail.Path, sorted[1].detail.Path, sorted[2].detail.Path}
	if !slices.Equal(paths, []string{"E:/workspace/pinned", "E:/workspace/alpha", "E:/workspace/zeta"}) {
		t.Fatalf("unexpected batch order: %v", paths)
	}
}

func TestGetCommitDetailSupportsMultiLineBody(t *testing.T) {
	root := t.TempDir()
	repoPath := filepath.Join(root, "repo")
	initTestRepo(t, repoPath)
	commitTestFile(t, repoPath, "tracked.txt", "base\n", "init")
	commitWithBody(t, repoPath, "tracked.txt", "base\nnext\n", "feat: add detail", "line one\n\nline three")

	service := NewService(root)
	request := Request{ScanRoots: []ScanRoot{{Path: root, Category: "测试"}}}
	snapshot, err := service.BuildAppSnapshot(request)
	if err != nil {
		t.Fatalf("build snapshot: %v", err)
	}
	if len(snapshot.Repos) != 1 {
		t.Fatalf("expected one repo, got %d", len(snapshot.Repos))
	}

	hash, err := runGitStrict(repoPath, []string{"rev-parse", "HEAD"})
	if err != nil {
		t.Fatalf("rev-parse HEAD: %v", err)
	}
	detail, err := service.GetCommitDetail(snapshot.Repos[0].ID, request, hash)
	if err != nil {
		t.Fatalf("get commit detail: %v", err)
	}
	if detail.Message != "feat: add detail" {
		t.Fatalf("expected subject to survive, got %q", detail.Message)
	}
	if detail.Body != "line one\n\nline three" {
		t.Fatalf("expected multiline body, got %q", detail.Body)
	}
	if detail.Files != 1 {
		t.Fatalf("expected one changed file, got %d", detail.Files)
	}
	if len(detail.FilesChanged) != 1 || detail.FilesChanged[0] != "tracked.txt" {
		t.Fatalf("expected tracked.txt in files changed, got %#v", detail.FilesChanged)
	}
}

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

	repo, ok := resolveRepoPathHint(repoID, "commit", repoPath, "测试")
	if !ok {
		t.Fatal("expected commit action to use path hint")
	}
	if repo.Path != normalizePath(repoPath) {
		t.Fatalf("expected normalized repo path %q, got %q", normalizePath(repoPath), repo.Path)
	}
	if repo.Category != "测试" {
		t.Fatalf("expected category to be preserved, got %q", repo.Category)
	}
}

func TestResolveRepoPathHintRejectsMismatchedRepoID(t *testing.T) {
	_, ok := resolveRepoPathHint(repoIDForPath("E:/workspace/repo-a"), "commit", "E:/workspace/repo-b", "测试")
	if ok {
		t.Fatal("expected mismatched path hint to be rejected")
	}
}

func TestResolveRepoByPathLoadsTargetSnapshot(t *testing.T) {
	targetPath := normalizePath("E:/workspace/repo-a")
	targetID := repoIDForPath(targetPath)
	loadCalls := 0

	repo, err := resolveRepoByPath(targetID, targetPath, "测试", time.Unix(0, 0), func(entry repoEntry, scanTime time.Time) (repoSnapshot, error) {
		loadCalls++
		return repoSnapshot{
			repo: Repo{ID: targetID},
			detail: RepoDetail{
				Repo: Repo{ID: targetID, Path: targetPath, Category: entry.category},
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
	if repo.Category != "测试" {
		t.Fatalf("expected resolved category to be preserved, got %q", repo.Category)
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
		RepoActionRequest{RepoPath: targetPath, RepoCategory: "测试"},
		func() []repoEntry { return entries },
		time.Unix(0, 0),
		func(entry repoEntry, scanTime time.Time) (repoSnapshot, error) {
			loadCalls++
			return repoSnapshot{
				repo: Repo{ID: targetID},
				detail: RepoDetail{
					Repo: Repo{ID: targetID, Path: normalizePath(entry.repoPath), Category: entry.category},
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
	if repo.Category != "测试" {
		t.Fatalf("expected pull category to be preserved, got %q", repo.Category)
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

func TestResolveRepoForActionWithLoadRestoresMissingCategoryFromEntries(t *testing.T) {
	targetPath := normalizePath("E:/workspace/repo-a")
	targetID := repoIDForPath(targetPath)
	discoverCalls := 0

	repo, err := resolveRepoForActionWithLoad(
		targetID,
		"discard-all",
		RepoActionRequest{RepoPath: targetPath},
		func() []repoEntry {
			discoverCalls++
			return []repoEntry{{repoPath: targetPath, category: "测试"}}
		},
		time.Unix(0, 0),
		func(entry repoEntry, scanTime time.Time) (repoSnapshot, error) {
			return repoSnapshot{detail: RepoDetail{Repo: Repo{
				ID: repoIDForPath(entry.repoPath), Path: normalizePath(entry.repoPath), Category: entry.category,
			}}}, nil
		},
	)
	if err != nil {
		t.Fatalf("expected missing category to fall back to discovery, got %v", err)
	}
	if discoverCalls != 1 || repo.Category != "测试" {
		t.Fatalf("expected discovered category, calls=%d category=%q", discoverCalls, repo.Category)
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
		RepoActionRequest{RepoPath: targetPath, RepoCategory: "测试"},
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
	if repo.Category != "测试" {
		t.Fatalf("expected commit category to be preserved, got %q", repo.Category)
	}
}

func TestMutateRepoDiscardAllClearsTrackedAndUntrackedChanges(t *testing.T) {
	repoPath := t.TempDir()
	trackedPath := filepath.Join(repoPath, "tracked.txt")
	untrackedPath := filepath.Join(repoPath, "generated.txt")
	if _, err := runGitStrict(repoPath, []string{"init"}); err != nil {
		t.Fatalf("init repo: %v", err)
	}
	if _, err := runGitStrict(repoPath, []string{"config", "user.email", "test@example.com"}); err != nil {
		t.Fatalf("config email: %v", err)
	}
	if _, err := runGitStrict(repoPath, []string{"config", "user.name", "Test User"}); err != nil {
		t.Fatalf("config name: %v", err)
	}
	if err := os.WriteFile(trackedPath, []byte("base\n"), 0o644); err != nil {
		t.Fatalf("write tracked file: %v", err)
	}
	if _, err := runGitStrict(repoPath, []string{"add", "tracked.txt"}); err != nil {
		t.Fatalf("stage tracked file: %v", err)
	}
	if _, err := runGitStrict(repoPath, []string{"commit", "-m", "init"}); err != nil {
		t.Fatalf("commit seed file: %v", err)
	}
	if err := os.WriteFile(trackedPath, []byte("changed\n"), 0o644); err != nil {
		t.Fatalf("modify tracked file: %v", err)
	}
	if err := os.WriteFile(untrackedPath, []byte("temp\n"), 0o644); err != nil {
		t.Fatalf("write untracked file: %v", err)
	}
	if err := defaultGitExecutor().mutateRepo(RepoDetail{Repo: Repo{Path: normalizePath(repoPath)}}, "discard-all", Request{}, RepoActionRequest{}); err != nil {
		t.Fatalf("discard all changes: %v", err)
	}
	content, err := os.ReadFile(trackedPath)
	if err != nil || strings.TrimSpace(string(content)) != "base" {
		t.Fatalf("expected tracked file restored to HEAD, got %q, err=%v", string(content), err)
	}
	if _, err := os.Stat(untrackedPath); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("expected untracked file removed, got err=%v", err)
	}
	status, err := runGitStrict(repoPath, []string{"status", "--porcelain"})
	if err != nil {
		t.Fatalf("read final status: %v", err)
	}
	if status != "" {
		t.Fatalf("expected clean worktree after discard, got %q", status)
	}
}
