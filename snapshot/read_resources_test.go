package snapshot

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"
)

func TestReadResourcesReuseUnchangedFilesAndInvalidateChangedFiles(t *testing.T) {
	repoPath := filepath.Join(t.TempDir(), "repo")
	initTestRepo(t, repoPath)
	filePath := filepath.Join(repoPath, "untracked.txt")
	if err := os.WriteFile(filePath, []byte("one\ntwo\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	service := NewService(repoPath)
	t.Cleanup(func() { _ = service.Close() })
	repoID := repoIDForPath(repoPath)
	service.SetReadActivity(repoID, false)
	reads := 0
	service.fileStats.readLines = func(path string) (int, os.FileInfo, error) {
		reads++
		return readFileLineCount(path)
	}
	request := Request{RepoPath: repoPath, RepoCategory: "test"}
	refresh := func(want int) {
		t.Helper()
		update, err := service.RefreshRepo(repoID, request)
		if err != nil || update.Repo.ScanError != "" {
			t.Fatalf("refresh: %v / %s", err, update.Repo.ScanError)
		}
		if len(update.Repo.Files) != 1 || update.Repo.Files[0].Additions != want {
			t.Fatalf("unexpected changes: %+v", update.Repo.Files)
		}
	}
	refresh(3)
	refresh(3)
	if reads != 1 {
		t.Fatalf("unchanged file was read %d times, want 1", reads)
	}
	if err := os.WriteFile(filePath, []byte("changed\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	refresh(2)
	if reads != 2 {
		t.Fatalf("changed file must be re-read, reads=%d", reads)
	}
	service.CleanupReadResources()
	refresh(2)
	if reads != 3 {
		t.Fatalf("periodic cleanup must release cached counts, reads=%d", reads)
	}
	service.SetReadActivity("another-repo", false)
	service.SetReadActivity(repoID, false)
	refresh(2)
	if reads != 4 {
		t.Fatalf("switching away must release the previous repo cache, reads=%d", reads)
	}
	if err := os.Remove(filePath); err != nil {
		t.Fatalf("read must not retain the file handle: %v", err)
	}
	update, err := service.RefreshRepo(repoID, request)
	if err != nil || len(update.Repo.Files) != 0 {
		t.Fatalf("deleted file still present: %+v, %v", update, err)
	}
	if len(service.fileStats.repo(repoID).files) != 0 {
		t.Fatal("removed/staged paths must not stay in the count cache")
	}
}

func TestReadResourcesDoNotCacheFailedReads(t *testing.T) {
	root := t.TempDir()
	filePath := filepath.Join(root, "file.txt")
	if err := os.WriteFile(filePath, []byte("one\ntwo"), 0o644); err != nil {
		t.Fatal(err)
	}
	service := NewService(root)
	service.SetReadActivity(repoIDForPath(root), false)
	reads := 0
	service.fileStats.readLines = func(path string) (int, os.FileInfo, error) {
		reads++
		if reads == 1 {
			return 0, nil, os.ErrPermission
		}
		return readFileLineCount(path)
	}
	executor := service.gitExecutor(Request{})
	first, firstErr := executor.buildUntrackedChanges(root, []string{"?? file.txt"}, nil)
	second, secondErr := executor.buildUntrackedChanges(root, []string{"?? file.txt"}, nil)
	if !errors.Is(firstErr, os.ErrPermission) || secondErr != nil {
		t.Fatalf("read failure must be exposed and recover on retry: %v / %v", firstErr, secondErr)
	}
	if first[0].Additions != 0 || second[0].Additions != 2 || reads != 2 {
		t.Fatalf("failed read was cached: first=%+v second=%+v reads=%d", first, second, reads)
	}
}

func TestReadResourcesReportUnreadableFilesAsScanErrors(t *testing.T) {
	repoPath := t.TempDir()
	initTestRepo(t, repoPath)
	if err := os.WriteFile(filepath.Join(repoPath, "untracked.txt"), []byte("content"), 0o644); err != nil {
		t.Fatal(err)
	}
	service := NewService(repoPath)
	t.Cleanup(func() { _ = service.Close() })
	repoID := repoIDForPath(repoPath)
	service.SetReadActivity(repoID, false)
	service.fileStats.readLines = func(string) (int, os.FileInfo, error) { return 0, nil, os.ErrPermission }
	update, err := service.RefreshRepo(repoID, Request{RepoPath: repoPath, RepoCategory: "test"})
	if err != nil {
		t.Fatal(err)
	}
	if update.Repo.Status != "error" || update.Repo.ScanError == "" || len(update.Repo.Files) != 1 {
		t.Fatalf("unreadable file was hidden or omitted: %+v", update.Repo)
	}
}

func TestReadResourcesReleaseInFlightCacheAndStopCachingWhileInactive(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "file.txt"), []byte("one"), 0o644); err != nil {
		t.Fatal(err)
	}
	service := NewService(root)
	repoID := repoIDForPath(root)
	service.SetReadActivity(repoID, false)
	started, resume, done := make(chan struct{}), make(chan struct{}), make(chan []FileChange, 1)
	var reads atomic.Int32
	service.fileStats.readLines = func(path string) (int, os.FileInfo, error) {
		if reads.Add(1) == 1 {
			close(started)
			<-resume
		}
		return readFileLineCount(path)
	}
	executor := service.gitExecutor(Request{})
	go func() {
		files, _ := executor.buildUntrackedChanges(root, []string{"?? file.txt"}, nil)
		done <- files
	}()
	<-started
	service.SetReadActivity("", false)
	close(resume)
	if files := <-done; len(files) != 1 || files[0].Additions != 1 {
		t.Fatalf("in-flight read must still complete accurately: %+v", files)
	}
	if service.fileStats.repo(repoID) != nil || len(service.fileStats.repos) != 0 {
		t.Fatal("an old request repopulated resources after loss of focus")
	}
	executor.buildUntrackedChanges(root, []string{"?? file.txt"}, nil)
	executor.buildUntrackedChanges(root, []string{"?? file.txt"}, nil)
	if reads.Load() != 3 || len(service.fileStats.repos) != 0 {
		t.Fatal("inactive requests must not retain new caches")
	}
	if err := service.Close(); err != nil {
		t.Fatal(err)
	}
	service.SetReadActivity(repoID, true)
	if service.fileStats.repo(repoID) != nil {
		t.Fatal("closed service must not reopen its cache")
	}
	if _, err := service.repoFiles.ignoredPaths(executor, root, "", nil); err == nil {
		t.Fatal("closed browser must reject late requests")
	}
}

func TestUntrackedFileStatsExpireWithoutRenewingOnHits(t *testing.T) {
	filePath := filepath.Join(t.TempDir(), "file.txt")
	if err := os.WriteFile(filePath, []byte("one"), 0o644); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(filePath)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now()
	stats := untrackedFileStats{size: info.Size(), modified: info.ModTime(), mode: info.Mode(), lines: 1, cachedAt: now}
	if !stats.matches(info, now.Add(ReadResourceCleanupInterval-time.Nanosecond)) || stats.matches(info, now.Add(ReadResourceCleanupInterval)) {
		t.Fatal("cached metadata/count must expire at five minutes even if frequently accessed")
	}
}

func TestFileBrowserReleasesSessionOnTabCloseSwitchBlurAndCleanup(t *testing.T) {
	root := t.TempDir()
	initTestRepo(t, root)
	if err := os.WriteFile(filepath.Join(root, "file.txt"), []byte("one"), 0o644); err != nil {
		t.Fatal(err)
	}
	service := NewService(root)
	t.Cleanup(func() { _ = service.Close() })
	repoID := repoIDForPath(root)
	request := Request{RepoPath: root, RepoCategory: "test"}
	open := func() *gitIgnoreSession {
		t.Helper()
		service.SetReadActivity(repoID, true)
		if _, err := service.ListRepoDirectory(repoID, request, ""); err != nil {
			t.Fatal(err)
		}
		if service.repoFiles.session == nil {
			t.Fatal("active browser must reuse one session")
		}
		return service.repoFiles.session
	}
	for _, release := range []func(){
		func() { service.SetReadActivity(repoID, false) },
		func() { service.SetReadActivity("other", true) },
		func() { service.SetReadActivity("", false) },
		service.CleanupReadResources,
	} {
		session := open()
		release()
		if service.repoFiles.session != nil || session.cmd.ProcessState == nil {
			t.Fatal("released session must be detached and waited")
		}
	}
	service.SetReadActivity("", false)
	if _, err := service.ListRepoDirectory(repoID, request, ""); err != nil {
		t.Fatal(err)
	}
	if service.repoFiles.session != nil {
		t.Fatal("late inactive directory read retained a Git process")
	}
}

func TestCloseOnlyTerminatesOwnedCommandsIncludingUnstreamedOnes(t *testing.T) {
	originalKill := terminateCommandTree
	t.Cleanup(func() { terminateCommandTree = originalKill })
	var killed []*exec.Cmd
	terminateCommandTree = func(cmd *exec.Cmd) error { killed = append(killed, cmd); return nil }
	service := NewService(t.TempDir())
	streamed, unstreamed, ended := exec.Command("owned-stream"), exec.Command("owned-no-stream"), exec.Command("ended")
	for _, item := range []struct {
		id  string
		cmd *exec.Cmd
	}{{"stream", streamed}, {"", unstreamed}, {"ended", ended}} {
		if err := service.commands.register(item.id, item.cmd); err != nil {
			t.Fatal(err)
		}
	}
	service.commands.unregister("ended", ended)
	service.SetReadActivity("", false)
	service.CleanupReadResources()
	if len(killed) != 0 {
		t.Fatal("blur or cleanup terminated running work")
	}
	if err := service.Close(); err != nil {
		t.Fatal(err)
	}
	if len(killed) != 2 || (killed[0] != streamed && killed[1] != streamed) || (killed[0] != unstreamed && killed[1] != unstreamed) {
		t.Fatalf("unexpected commands terminated: %v", killed)
	}
	if err := service.Close(); err != nil || len(killed) != 2 {
		t.Fatal("close must be idempotent")
	}
	if err := service.commands.register("late", exec.Command("late")); err == nil {
		t.Fatal("closed registry accepted a late command")
	}
}

func TestCloseReportsCommandTerminationFailure(t *testing.T) {
	originalKill := terminateCommandTree
	t.Cleanup(func() { terminateCommandTree = originalKill })
	failure := errors.New("termination failed")
	terminateCommandTree = func(*exec.Cmd) error { return failure }
	service := NewService(t.TempDir())
	if err := service.commands.register("stream", exec.Command("owned")); err != nil {
		t.Fatal(err)
	}
	for range 2 {
		if err := service.Close(); !errors.Is(err, failure) {
			t.Fatalf("shutdown failure was hidden or could not be retried: %v", err)
		}
	}
}

func BenchmarkUntrackedFileStatsCache(b *testing.B) {
	root := b.TempDir()
	entries := make([]string, 100)
	for index := range entries {
		name := filepath.Join(root, time.Unix(int64(index), 0).Format("150405")+".txt")
		if err := os.WriteFile(name, make([]byte, 64*1024), 0o644); err != nil {
			b.Fatal(err)
		}
		entries[index] = "?? " + filepath.Base(name)
	}
	for _, enabled := range []bool{false, true} {
		label := "uncached"
		if enabled {
			label = "cached"
		}
		b.Run(label, func(b *testing.B) {
			service := NewService(root)
			if enabled {
				service.SetReadActivity(repoIDForPath(root), false)
			}
			reads := 0
			service.fileStats.readLines = func(path string) (int, os.FileInfo, error) {
				reads++
				return readFileLineCount(path)
			}
			executor := service.gitExecutor(Request{})
			executor.buildUntrackedChanges(root, entries, nil)
			reads = 0
			b.ReportAllocs()
			b.ResetTimer()
			for range b.N {
				executor.buildUntrackedChanges(root, entries, nil)
			}
			b.StopTimer()
			b.ReportMetric(float64(reads)/float64(b.N), "file-reads/op")
		})
	}
}
