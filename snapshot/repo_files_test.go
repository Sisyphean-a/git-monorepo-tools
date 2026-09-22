package snapshot

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestListRepoDirectoryLoadsOnlyRequestedLevel(t *testing.T) {
	repoPath := t.TempDir()
	initTestRepo(t, repoPath)
	mustWriteRepoFile(t, repoPath, "README.md", "readme")
	mustWriteRepoFile(t, repoPath, "src/main.go", "package main")
	mustWriteRepoFile(t, repoPath, "src/nested/value.txt", "nested")

	service := NewService(repoPath)
	t.Cleanup(service.CloseRepoFileBrowser)
	request := repoFileRequest(repoPath)
	entries, err := service.ListRepoDirectory(repoIDForPath(repoPath), request, "")
	if err != nil {
		t.Fatalf("ListRepoDirectory() error = %v", err)
	}
	ignoreSession := service.repoFiles.session
	if ignoreSession == nil {
		t.Fatal("ListRepoDirectory() did not keep the Git ignore session")
	}

	if len(entries) != 2 {
		t.Fatalf("root entries = %#v, want one directory and one file", entries)
	}
	if entries[0].Name != "src" || !entries[0].IsDir || entries[0].Path != "src" {
		t.Fatalf("first entry = %#v, want src directory", entries[0])
	}
	if entries[1].Name != "README.md" || entries[1].IsDir || entries[1].Path != "README.md" {
		t.Fatalf("second entry = %#v, want README.md file", entries[1])
	}

	srcEntries, err := service.ListRepoDirectory(repoIDForPath(repoPath), request, "src")
	if err != nil {
		t.Fatalf("ListRepoDirectory(src) error = %v", err)
	}
	if len(srcEntries) != 2 || srcEntries[0].Name != "nested" || srcEntries[1].Name != "main.go" {
		t.Fatalf("src entries = %#v, want only src children with directories first", srcEntries)
	}
	if service.repoFiles.session != ignoreSession {
		t.Fatal("ListRepoDirectory() restarted Git while browsing the same repository")
	}

	emptyRepoPath := filepath.Join(t.TempDir(), "empty-repo")
	initTestRepo(t, emptyRepoPath)
	emptyEntries, err := service.ListRepoDirectory(repoIDForPath(emptyRepoPath), repoFileRequest(emptyRepoPath), "")
	if err != nil || len(emptyEntries) != 0 {
		t.Fatalf("empty repository entries = %#v, error = %v", emptyEntries, err)
	}
	if service.repoFiles.session != nil {
		t.Fatal("ListRepoDirectory() kept the previous repository Git session after switching repositories")
	}
}

func TestListRepoDirectoryExcludesGitIgnoredEntries(t *testing.T) {
	repoPath := t.TempDir()
	initTestRepo(t, repoPath)
	mustWriteRepoFile(t, repoPath, "ignored.txt", "ignored")
	mustWriteRepoFile(t, repoPath, "ignored-dir/value.txt", "ignored")
	mustWriteRepoFile(t, repoPath, ".gitignore", "ignored.txt\nignored-dir/\n*.log\n!keep.log\n")
	mustWriteRepoFile(t, repoPath, "visible.txt", "visible")
	mustWriteRepoFile(t, repoPath, "visible-dir/keep.txt", "visible")
	mustWriteRepoFile(t, repoPath, "visible-dir/keep.log", "visible")
	mustWriteRepoFile(t, repoPath, "visible-dir/debug.log", "ignored")
	trackedLogPath := filepath.Join(repoPath, "tracked.log")
	if err := os.WriteFile(trackedLogPath, []byte("tracked"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := runGitStrict(repoPath, []string{"add", "-f", "tracked.log"}); err != nil {
		t.Fatalf("force add tracked log: %v", err)
	}
	if _, err := runGitStrict(repoPath, []string{"commit", "-m", "track ignored log"}); err != nil {
		t.Fatalf("commit tracked log: %v", err)
	}

	service := NewService(repoPath)
	t.Cleanup(service.CloseRepoFileBrowser)
	request := repoFileRequest(repoPath)
	entries, err := service.ListRepoDirectory(repoIDForPath(repoPath), request, "")
	if err != nil {
		t.Fatalf("ListRepoDirectory() error = %v", err)
	}
	if got, want := repoTreeEntryNames(entries), "visible-dir,.gitignore,tracked.log,visible.txt"; got != want {
		t.Fatalf("root entries = %q, want %q", got, want)
	}

	visibleEntries, err := service.ListRepoDirectory(repoIDForPath(repoPath), request, "visible-dir")
	if err != nil {
		t.Fatalf("ListRepoDirectory(visible-dir) error = %v", err)
	}
	if got, want := repoTreeEntryNames(visibleEntries), "keep.log,keep.txt"; got != want {
		t.Fatalf("visible-dir entries = %q, want %q", got, want)
	}

	mustWriteRepoFile(t, repoPath, ".gitignore", "ignored.txt\nignored-dir/\n*.log\n!keep.log\n!debug.log\n")
	refreshedEntries, err := service.ListRepoDirectory(repoIDForPath(repoPath), request, "visible-dir")
	if err != nil {
		t.Fatalf("ListRepoDirectory(visible-dir) after rule change error = %v", err)
	}
	if got, want := repoTreeEntryNames(refreshedEntries), "debug.log,keep.log,keep.txt"; got != want {
		t.Fatalf("visible-dir entries after rule change = %q, want %q", got, want)
	}
}

func BenchmarkListRepoDirectoryReusesGitIgnoreSession(b *testing.B) {
	repoPath := b.TempDir()
	initTestRepo(b, repoPath)
	mustWriteRepoFile(b, repoPath, ".gitignore", "ignored-*.txt\n")
	for index := 0; index < 64; index++ {
		mustWriteRepoFile(b, repoPath, fmt.Sprintf("visible-%02d.txt", index), "visible")
		mustWriteRepoFile(b, repoPath, fmt.Sprintf("ignored-%02d.txt", index), "ignored")
	}

	service := NewService(repoPath)
	b.Cleanup(service.CloseRepoFileBrowser)
	request := repoFileRequest(repoPath)
	if _, err := service.ListRepoDirectory(repoIDForPath(repoPath), request, ""); err != nil {
		b.Fatal(err)
	}
	b.ResetTimer()
	for index := 0; index < b.N; index++ {
		if _, err := service.ListRepoDirectory(repoIDForPath(repoPath), request, ""); err != nil {
			b.Fatal(err)
		}
	}
}

func TestReadRepoFileReturnsTextAndRejectsUnsafeContent(t *testing.T) {
	repoPath := t.TempDir()
	mustWriteRepoFile(t, repoPath, "src/main.go", "package main\n")
	mustWriteRepoFile(t, repoPath, "binary.dat", "text\x00binary")
	mustWriteRepoFile(t, repoPath, "large.txt", strings.Repeat("a", maxRepoFilePreviewBytes+1))

	service := NewService(repoPath)
	request := repoFileRequest(repoPath)
	content, err := service.ReadRepoFile(repoIDForPath(repoPath), request, "src/main.go")
	if err != nil {
		t.Fatalf("ReadRepoFile() error = %v", err)
	}
	if content.Path != "src/main.go" || content.Content != "package main\n" || content.Size != 13 {
		t.Fatalf("content = %#v", content)
	}

	if _, err := service.ReadRepoFile(repoIDForPath(repoPath), request, "../outside.txt"); err == nil {
		t.Fatal("ReadRepoFile() accepted a path outside the repository")
	}
	if _, err := service.ReadRepoFile(repoIDForPath(repoPath), request, "binary.dat"); err == nil || !strings.Contains(err.Error(), "二进制") {
		t.Fatalf("binary error = %v", err)
	}
	if _, err := service.ReadRepoFile(repoIDForPath(repoPath), request, "large.txt"); err == nil || !strings.Contains(err.Error(), "1 MiB") {
		t.Fatalf("large file error = %v", err)
	}
}

func TestReadRepoFileRejectsSymlinkOutsideRepository(t *testing.T) {
	repoPath := t.TempDir()
	outsideDirectory := t.TempDir()
	outsidePath := filepath.Join(outsideDirectory, "outside.txt")
	if err := os.WriteFile(outsidePath, []byte("outside"), 0o644); err != nil {
		t.Fatal(err)
	}
	linkPath := filepath.Join(repoPath, "outside-link.txt")
	requestedPath := "outside-link.txt"
	if err := os.Symlink(outsidePath, linkPath); err != nil {
		if runtime.GOOS != "windows" {
			t.Skipf("当前环境无法创建符号链接：%v", err)
		}
		linkPath = filepath.Join(repoPath, "outside-link")
		output, junctionErr := exec.Command("cmd", "/c", "mklink", "/J", linkPath, outsideDirectory).CombinedOutput()
		if junctionErr != nil {
			t.Skipf("当前环境无法创建目录联接：%v (%s)", junctionErr, strings.TrimSpace(string(output)))
		}
		requestedPath = "outside-link/outside.txt"
	}

	service := NewService(repoPath)
	request := repoFileRequest(repoPath)
	if _, err := service.ReadRepoFile(repoIDForPath(repoPath), request, requestedPath); err == nil {
		t.Fatal("ReadRepoFile() followed a symlink outside the repository")
	}
}

func repoFileRequest(repoPath string) Request {
	return Request{RepoPath: normalizePath(repoPath), RepoCategory: "测试"}
}

func repoTreeEntryNames(entries []RepoTreeEntry) string {
	names := make([]string, 0, len(entries))
	for _, entry := range entries {
		names = append(names, entry.Name)
	}
	return strings.Join(names, ",")
}

func mustWriteRepoFile(t testing.TB, repoPath, relativePath, content string) {
	t.Helper()
	path := filepath.Join(repoPath, filepath.FromSlash(relativePath))
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}
