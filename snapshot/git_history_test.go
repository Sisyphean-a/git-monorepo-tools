package snapshot

import (
	"path/filepath"
	"strings"
	"testing"
)

func TestGetRepoHistoryScopesAndRefList(t *testing.T) {
	root := t.TempDir()
	repoPath := filepath.Join(root, "repo")
	initTestRepo(t, repoPath)
	commitTestFile(t, repoPath, "base.txt", "base\n", "base")
	runTestGit(t, repoPath, "branch", "feature")
	commitTestFile(t, repoPath, "main.txt", "main\n", "main work")
	runTestGit(t, repoPath, "checkout", "feature")
	commitTestFile(t, repoPath, "feature.txt", "feature\n", "feature work")
	runTestGit(t, repoPath, "tag", "v1")
	runTestGit(t, repoPath, "checkout", "-")

	service := NewService(root)
	request := Request{ScanRoots: []ScanRoot{{Path: root, Category: "测试"}}}
	repoID := repoIDForPath(repoPath)

	all, err := service.GetRepoHistory(repoID, request, 0, 50)
	if err != nil {
		t.Fatalf("get all history: %v", err)
	}
	if all.Scope != HistoryScopeAll {
		t.Fatalf("expected all scope, got %q", all.Scope)
	}
	allMessages := historyMessages(all)
	for _, message := range []string{"base", "main work", "feature work"} {
		if !allMessages[message] {
			t.Fatalf("all-branch history missing %q: %#v", message, all.Commits)
		}
	}
	if len(all.Refs) == 0 {
		t.Fatal("first page must return branch picker refs")
	}
	if !hasHistoryRef(all.Refs, "refs/heads/feature", "branch") || !hasHistoryRef(all.Refs, "refs/tags/v1", "tag") {
		t.Fatalf("expected local branch and tag refs, got %#v", all.Refs)
	}
	if !historyRefsHaveCurrent(all.Refs) {
		t.Fatalf("expected a current local branch marker: %#v", all.Refs)
	}

	head, err := service.GetRepoHistory(repoID, Request{ScanRoots: request.ScanRoots, HistoryScope: HistoryScopeHead}, 0, 50)
	if err != nil {
		t.Fatalf("get head history: %v", err)
	}
	if head.Scope != HistoryScopeHead {
		t.Fatalf("expected head scope, got %q", head.Scope)
	}
	headMessages := historyMessages(head)
	if !headMessages["main work"] || headMessages["feature work"] {
		t.Fatalf("head history must only contain current branch: %#v", head.Commits)
	}
	if len(head.Refs) == 0 {
		t.Fatal("head page must still return branch picker refs")
	}

	selected, err := service.GetRepoHistory(repoID, Request{
		ScanRoots: request.ScanRoots, HistoryScope: HistoryScopeSelected, HistoryRefs: []string{"refs/heads/feature"},
	}, 0, 50)
	if err != nil {
		t.Fatalf("get selected history: %v", err)
	}
	if selected.Scope != HistoryScopeSelected || len(selected.SelectedRefs) != 1 || selected.SelectedRefs[0] != "refs/heads/feature" {
		t.Fatalf("unexpected selected scope echo: %#v", selected)
	}
	selectedMessages := historyMessages(selected)
	if !selectedMessages["feature work"] || selectedMessages["main work"] {
		t.Fatalf("selected history must only contain selected branch: %#v", selected.Commits)
	}

	second, err := service.GetRepoHistory(repoID, request, 1, 1)
	if err != nil {
		t.Fatalf("get second page: %v", err)
	}
	if len(second.Refs) != 0 {
		t.Fatalf("later pages must not repeat branch picker refs: %#v", second.Refs)
	}
}

func TestGetRepoHistoryRejectsUnknownSelectedRefs(t *testing.T) {
	root := t.TempDir()
	repoPath := filepath.Join(root, "repo")
	initTestRepo(t, repoPath)
	commitTestFile(t, repoPath, "base.txt", "base\n", "base")
	runTestGit(t, repoPath, "branch", "feature")
	runTestGit(t, repoPath, "checkout", "feature")
	commitTestFile(t, repoPath, "feature.txt", "feature\n", "feature work")
	runTestGit(t, repoPath, "checkout", "-")

	service := NewService(root)
	request := Request{ScanRoots: []ScanRoot{{Path: root, Category: "测试"}}, HistoryScope: HistoryScopeSelected, HistoryRefs: []string{"--all", "refs/heads/missing"}}
	page, err := service.GetRepoHistory(repoIDForPath(repoPath), request, 0, 50)
	if err != nil {
		t.Fatalf("get history with invalid refs: %v", err)
	}
	if page.Scope != HistoryScopeHead || len(page.SelectedRefs) != 0 {
		t.Fatalf("invalid refs must fall back to current head: %#v", page)
	}
	if historyMessages(page)["feature work"] {
		t.Fatalf("invalid refs must not leak other branch commits: %#v", page.Commits)
	}
}

func TestGetRepoHistoryHeadScopeOnEmptyRepo(t *testing.T) {
	root := t.TempDir()
	repoPath := filepath.Join(root, "repo")
	initTestRepo(t, repoPath)

	service := NewService(root)
	page, err := service.GetRepoHistory(repoIDForPath(repoPath), Request{
		ScanRoots: []ScanRoot{{Path: root, Category: "测试"}}, HistoryScope: HistoryScopeHead,
	}, 0, 10)
	if err != nil {
		t.Fatalf("empty repo head history must be empty, not an error: %v", err)
	}
	if page.Scope != HistoryScopeHead || len(page.Commits) != 0 {
		t.Fatalf("unexpected empty head page: %#v", page)
	}
}

func historyMessages(page RepoHistoryPage) map[string]bool {
	messages := map[string]bool{}
	for _, commit := range page.Commits {
		messages[commit.Message] = true
	}
	return messages
}

func hasHistoryRef(refs []RepoRef, name, kind string) bool {
	for _, ref := range refs {
		if ref.Name == name && ref.Kind == kind {
			return true
		}
	}
	return false
}

func historyRefsHaveCurrent(refs []RepoRef) bool {
	for _, ref := range refs {
		if ref.Current {
			return true
		}
	}
	return false
}

func TestGetRepoHistoryExcludesStashAndNotes(t *testing.T) {
	root := t.TempDir()
	repoPath := filepath.Join(root, "repo")
	initTestRepo(t, repoPath)
	commitTestFile(t, repoPath, "tracked.txt", "base\n", "base")

	service := NewService(root)
	request := Request{ScanRoots: []ScanRoot{{Path: root, Category: "测试"}}}
	before, err := service.BuildAppSnapshot(request)
	if err != nil {
		t.Fatalf("build snapshot: %v", err)
	}
	if len(before.Repos) != 1 {
		t.Fatalf("expected one repo, got %d", len(before.Repos))
	}
	repoID := before.Repos[0].ID

	runTestGit(t, repoPath, "notes", "add", "-m", "review note", "HEAD")
	writeTestFile(t, repoPath, "tracked.txt", "base\nstashed\n")
	runTestGit(t, repoPath, "stash", "push", "-m", "temp work")

	after, err := service.BuildRepoSnapshot(repoID, request, false)
	if err != nil {
		t.Fatalf("refresh repo snapshot: %v", err)
	}
	if after.Repo.RefsRevision != before.Repos[0].RefsRevision {
		t.Fatalf("stash and notes must not invalidate history refs: before=%s after=%s", before.Repos[0].RefsRevision, after.Repo.RefsRevision)
	}

	page, err := service.GetRepoHistory(repoID, request, 0, 50)
	if err != nil {
		t.Fatalf("get repo history: %v", err)
	}
	if len(page.Commits) != 1 {
		t.Fatalf("stash and notes commits must stay out of branch history: %#v", page.Commits)
	}
	commit := page.Commits[0]
	if commit.Message != "base" {
		t.Fatalf("unexpected history entry: %#v", commit)
	}
	for _, ref := range commit.Refs {
		if isExcludedHistoryRef(ref) {
			t.Fatalf("excluded ref leaked into history decorations: %q", ref)
		}
	}
	if strings.Contains(commit.Message, "temp work") || strings.Contains(commit.Message, "review note") {
		t.Fatalf("stash or notes message leaked into history: %q", commit.Message)
	}
}
