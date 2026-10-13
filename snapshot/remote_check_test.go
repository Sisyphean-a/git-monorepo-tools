package snapshot

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func setupRemoteCheckRepos(t *testing.T) (string, string) {
	t.Helper()
	root := t.TempDir()
	remote := filepath.Join(root, "remote.git")
	seed := filepath.Join(root, "seed")
	local := filepath.Join(root, "local")
	updater := filepath.Join(root, "updater")
	if _, err := runGitStrict(root, []string{"init", "--bare", remote}); err != nil {
		t.Fatal(err)
	}
	initTestRepo(t, seed)
	commitTestFile(t, seed, "tracked.txt", "base\n", "base")
	if _, err := runGitStrict(seed, []string{"remote", "add", "origin", remote}); err != nil {
		t.Fatal(err)
	}
	if _, err := runGitStrict(seed, []string{"push", "-u", "origin", "HEAD"}); err != nil {
		t.Fatal(err)
	}
	cloneTestRepo(t, root, remote, local)
	cloneTestRepo(t, root, remote, updater)
	return local, updater
}

func breakRemoteCheckRepo(t *testing.T, path string) {
	t.Helper()
	if _, err := runGitStrict(path, []string{"remote", "set-url", "origin", filepath.Join(t.TempDir(), "missing.git")}); err != nil {
		t.Fatal(err)
	}
	original := remoteFetchRetryDelays
	remoteFetchRetryDelays = []time.Duration{0, 0, 0}
	t.Cleanup(func() { remoteFetchRetryDelays = original })
}

func assertRemoteCheckJSON(t *testing.T, repo Repo, status string) {
	t.Helper()
	data, err := json.Marshal(repo)
	if err != nil {
		t.Fatal(err)
	}
	var value struct {
		RemoteCheck *struct {
			Status    string `json:"status"`
			CheckedAt string `json:"checkedAt"`
			Error     string `json:"error"`
		} `json:"remoteCheck"`
	}
	if err := json.Unmarshal(data, &value); err != nil {
		t.Fatal(err)
	}
	if value.RemoteCheck == nil || value.RemoteCheck.Status != status || value.RemoteCheck.CheckedAt == "" {
		t.Fatalf("expected explicit remote check %q and timestamp: %s", status, data)
	}
	if status == "error" && value.RemoteCheck.Error == "" {
		t.Fatalf("expected retained remote error: %s", data)
	}
}

func TestBatchPullFetchesBeforeDecidingStaleRepoIsUpToDate(t *testing.T) {
	local, updater := setupRemoteCheckRepos(t)
	commitTestFile(t, updater, "tracked.txt", "base\nremote\n", "remote change")
	if _, err := runGitStrict(updater, []string{"push"}); err != nil {
		t.Fatal(err)
	}
	result, err := NewService(local).RunBatch("pull", Request{ScanRoots: []ScanRoot{{Path: local}}, Concurrency: 1})
	if err != nil || len(result.Results) != 1 || result.Results[0].Result != "pulled" || result.Results[0].Commits != 1 {
		t.Fatalf("stale behind=0 must not skip remote commits: result=%+v err=%v", result.Results, err)
	}
	data, err := os.ReadFile(filepath.Join(local, "tracked.txt"))
	if err != nil || strings.ReplaceAll(string(data), "\r\n", "\n") != "base\nremote\n" {
		t.Fatalf("remote commit must actually be pulled: %q %v", data, err)
	}
	if len(result.Updates) != 1 {
		t.Fatalf("expected repo update: %+v", result)
	}
	assertRemoteCheckJSON(t, result.Updates[0].Repo.Repo, "success")
}

func TestBatchPullRechecksSafetyAfterFetching(t *testing.T) {
	local, updater := setupRemoteCheckRepos(t)
	commitTestFile(t, updater, "tracked.txt", "remote\n", "remote change")
	if _, err := runGitStrict(updater, []string{"push"}); err != nil {
		t.Fatal(err)
	}
	original := runRemoteFetch
	t.Cleanup(func() { runRemoteFetch = original })
	runRemoteFetch = func(executor gitExecutor, path, remote string) error {
		if err := original(executor, path, remote); err != nil {
			return err
		}
		return os.WriteFile(filepath.Join(path, "tracked.txt"), []byte("local edit\n"), 0644)
	}
	result, err := NewService(local).RunBatch("pull", Request{ScanRoots: []ScanRoot{{Path: local}}, Concurrency: 1})
	if err != nil || len(result.Results) != 1 || result.Results[0].Result != "failed" || !strings.Contains(result.Results[0].Detail, "本地改动") {
		t.Fatalf("changes appearing during fetch must prevent pull: result=%+v err=%v", result, err)
	}
	data, err := os.ReadFile(filepath.Join(local, "tracked.txt"))
	if err != nil || string(data) != "local edit\n" {
		t.Fatalf("local edit must remain untouched: %q %v", data, err)
	}
}

func TestBatchPullReportsFetchFailureInsteadOfUpToDate(t *testing.T) {
	local, _ := setupRemoteCheckRepos(t)
	breakRemoteCheckRepo(t, local)
	result, err := NewService(local).RunBatch("pull", Request{ScanRoots: []ScanRoot{{Path: local}}, Concurrency: 1})
	if err != nil || len(result.Results) != 1 || result.Results[0].Result != "failed" || !strings.Contains(result.Results[0].Detail, "远端") {
		t.Fatalf("failed fetch must never become up-to-date: result=%+v err=%v", result.Results, err)
	}
	if len(result.Updates) != 1 {
		t.Fatalf("failed remote check must update repo feedback: %+v", result)
	}
	if result.Updates[0].Repo.ScanError != "" {
		t.Fatalf("remote failure is not a local scan failure: %+v", result.Updates[0])
	}
	assertRemoteCheckJSON(t, result.Updates[0].Repo.Repo, "error")
}

func TestBatchPullPublishesSuccessfulCheckForUpToDateRepo(t *testing.T) {
	local, _ := setupRemoteCheckRepos(t)
	result, err := NewService(local).RunBatch("pull", Request{ScanRoots: []ScanRoot{{Path: local}}, Concurrency: 1})
	if err != nil || len(result.Results) != 1 || result.Results[0].Result != "uptodate" || len(result.Updates) != 1 {
		t.Fatalf("up-to-date still requires a published remote check: result=%+v err=%v", result, err)
	}
	assertRemoteCheckJSON(t, result.Updates[0].Repo.Repo, "success")
}

func TestRemoteCheckFailureDoesNotBecomeLocalScanError(t *testing.T) {
	local, _ := setupRemoteCheckRepos(t)
	breakRemoteCheckRepo(t, local)
	service := NewService(local)
	update, err := service.BuildRepoSnapshot(repoIDForPath(local), Request{RepoPath: local, RepoCategory: "测试"}, true)
	if err != nil || update.Repo.ScanError != "" || update.Repo.Status != "clean" {
		t.Fatalf("local status must remain independent of fetch failure: %+v err=%v", update, err)
	}
	assertRemoteCheckJSON(t, update.Repo.Repo, "error")
}

func TestRemoteCheckSuccessDoesNotHideLocalReadFailure(t *testing.T) {
	local, _ := setupRemoteCheckRepos(t)
	original := runRemoteFetch
	t.Cleanup(func() { runRemoteFetch = original })
	runRemoteFetch = func(executor gitExecutor, path, remote string) error {
		if err := original(executor, path, remote); err != nil {
			return err
		}
		return os.WriteFile(filepath.Join(path, ".git", "config"), []byte("[invalid"), 0600)
	}
	update, err := NewService(local).BuildRepoSnapshot(repoIDForPath(local), Request{RepoPath: local, RepoCategory: "测试"}, true)
	if err != nil || update.Repo.Status != "error" || update.Repo.ScanError == "" {
		t.Fatalf("successful fetch must not hide a later local read failure: %+v err=%v", update, err)
	}
	assertRemoteCheckJSON(t, update.Repo.Repo, "success")
}

func TestHistoryReferenceRevisionChangesAfterFetchWithoutMovingHEAD(t *testing.T) {
	local, updater := setupRemoteCheckRepos(t)
	service := NewService(local)
	request := Request{RepoPath: local, RepoCategory: "测试"}
	id := repoIDForPath(local)
	before, err := service.BuildRepoSnapshot(id, request, false)
	if err != nil {
		t.Fatal(err)
	}
	beforeRefs := historyReferenceRevisionJSON(t, before.Repo.Repo)
	if _, err := runGitStrict(updater, []string{"checkout", "-b", "feature"}); err != nil {
		t.Fatal(err)
	}
	commitTestFile(t, updater, "feature.txt", "remote feature\n", "remote feature")
	if _, err := runGitStrict(updater, []string{"push", "origin", "feature"}); err != nil {
		t.Fatal(err)
	}
	after, err := service.BuildRepoSnapshot(id, request, true)
	if err != nil {
		t.Fatal(err)
	}
	afterRefs := historyReferenceRevisionJSON(t, after.Repo.Repo)
	if beforeRefs == afterRefs || before.Repo.HeadRevision != after.Repo.HeadRevision || before.Repo.Behind != after.Repo.Behind {
		t.Fatalf("all-ref history must detect fetched branches independently of HEAD and behind: before=%+v after=%+v", before.Repo.Repo, after.Repo.Repo)
	}
	page, err := service.GetRepoHistory(id, request, 0, 50)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, commit := range page.Commits {
		found = found || commit.Message == "remote feature"
	}
	if !found {
		t.Fatalf("fetched remote commit must be visible in history: %+v", page)
	}
	polled, err := service.BuildRepoSnapshot(id, request, false)
	if err != nil || historyReferenceRevisionJSON(t, polled.Repo.Repo) != afterRefs {
		t.Fatalf("unchanged local polls must keep the same reference revision: %+v err=%v", polled, err)
	}
	if _, err := runGitStrict(local, []string{"tag", "reviewed"}); err != nil {
		t.Fatal(err)
	}
	tagged, err := service.BuildRepoSnapshot(id, request, false)
	if err != nil || historyReferenceRevisionJSON(t, tagged.Repo.Repo) == afterRefs {
		t.Fatalf("reference labels must refresh even without new commits: %+v err=%v", tagged, err)
	}
}

func historyReferenceRevisionJSON(t *testing.T, repo Repo) string {
	t.Helper()
	data, err := json.Marshal(repo)
	if err != nil {
		t.Fatal(err)
	}
	var value struct {
		RefsRevision string `json:"refsRevision"`
	}
	if err := json.Unmarshal(data, &value); err != nil || value.RefsRevision == "" {
		t.Fatalf("snapshot must carry a reference revision: %s err=%v", data, err)
	}
	return value.RefsRevision
}

func TestSinglePullPublishesSuccessfulRemoteCheck(t *testing.T) {
	local, _ := setupRemoteCheckRepos(t)
	update, err := NewService(local).MutateRepo(repoIDForPath(local), "pull", Request{ScanRoots: []ScanRoot{{Path: local}}}, RepoActionRequest{})
	if err != nil {
		t.Fatal(err)
	}
	assertRemoteCheckJSON(t, update.Repo.Repo, "success")
}
