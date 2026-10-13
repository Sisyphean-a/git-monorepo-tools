package snapshot

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"testing"
	"time"
	"unicode/utf8"
)

func TestBackgroundTaskLogBoundsAndCursor(t *testing.T) {
	var log taskLog
	log.write("abc")
	first := log.read(-1)
	if first.Text != "abc" || first.Cursor != 3 || !first.Reset {
		t.Fatalf("initial log: %+v", first)
	}
	log.write("中文")
	if next := log.read(first.Cursor); next.Text != "中文" || next.Reset {
		t.Fatalf("incremental log: %+v", next)
	}
	log.write(strings.Repeat("中", BackgroundTaskLogBytes))
	tail := log.read(first.Cursor)
	if !tail.Reset || !tail.Truncated || len(tail.Text) > BackgroundTaskLogBytes || !utf8.ValidString(tail.Text) || len(log.data) != BackgroundTaskLogBytes {
		t.Fatal("log did not remain bounded at a UTF-8 boundary")
	}
	if next := log.read(tail.Cursor); next.Text != "" || next.Reset {
		t.Fatalf("unchanged cursor: %+v", next)
	}
	if allocations := testing.AllocsPerRun(100, func() { log.write("hot output") }); allocations != 0 {
		t.Fatalf("steady writes allocated: %v", allocations)
	}
	var split taskLog
	split.write(string([]byte{0xe4, 0xb8}))
	before := split.read(-1)
	if before.Text != "" || before.Cursor != 0 {
		t.Fatalf("partial rune was delivered: %+v", before)
	}
	split.write(string([]byte{0xad}))
	if after := split.read(before.Cursor); after.Text != "中" || after.Cursor != 3 {
		t.Fatalf("split rune was lost: %+v", after)
	}
}

func TestBackgroundTaskStreamsDoNotSplitUTF8Characters(t *testing.T) {
	var log taskLog
	stdout := taskOutputWriter{append: log.write}
	stderr := taskOutputWriter{append: log.write}
	stdout.write(string([]byte{0xe4, 0xb8}))
	stderr.write("stderr\n")
	stdout.write(string([]byte{0xad}))
	if output := log.read(-1); output.Text != "stderr\n中" || !utf8.ValidString(output.Text) {
		t.Fatalf("streams interleaved inside a character: %+v", output)
	}
	stdout.write(string([]byte{0xe4}))
	stdout.flush()
	if output := log.read(-1); output.Text != "stderr\n中�" {
		t.Fatalf("incomplete final character disappeared: %+v", output)
	}
}

func TestBackgroundTaskProcess(t *testing.T) {
	args := os.Args
	index := -1
	for i, arg := range args {
		if arg == "--" {
			index = i
			break
		}
	}
	if index < 0 || index+1 >= len(args) {
		return
	}
	mode := args[index+1]
	if mode == "emit" {
		fmt.Print(strings.Repeat("abcdefgh\n", BackgroundTaskLogBytes/2))
		fmt.Fprintln(os.Stderr, "STDERR")
		fmt.Println("TAIL中文")
		os.Exit(0)
	}
	if mode == "fail" {
		fmt.Fprintln(os.Stderr, "EXPECTED_FAILURE")
		os.Exit(7)
	}
	if mode == "tree" || mode == "orphan" {
		child := exec.Command(os.Args[0], "-test.run=^TestBackgroundTaskProcess$", "--", "wait")
		child.Stdout, child.Stderr = os.Stdout, os.Stderr
		if err := child.Start(); err != nil {
			panic(err)
		}
		fmt.Printf("CHILD=%d\n", child.Process.Pid)
		if mode == "orphan" {
			os.Exit(0)
		}
	}
	fmt.Println("READY")
	for {
		time.Sleep(time.Hour)
	}
}

func backgroundTestRequest(t *testing.T, mode string) BackgroundTaskRequest {
	t.Helper()
	command := "'" + strings.ReplaceAll(os.Args[0], "'", "'\\''") + "' -test.run=^TestBackgroundTaskProcess$ -- " + mode
	if runtime.GOOS == "windows" {
		command = "& '" + strings.ReplaceAll(os.Args[0], "'", "''") + "' '-test.run=^TestBackgroundTaskProcess$' '--' '" + mode + "'; exit $LASTEXITCODE"
	}
	return BackgroundTaskRequest{TaskID: "task", RepoID: "repo", RepoName: "project", RepoPath: t.TempDir(), Name: "test", Command: command, WorkDir: "."}
}

func backgroundTestManager(t *testing.T) (*BackgroundTasks, chan BackgroundTaskState) {
	t.Helper()
	events := make(chan BackgroundTaskState, 100)
	manager := NewBackgroundTasks(func(state BackgroundTaskState) { events <- state })
	t.Cleanup(func() {
		if err := manager.Close(); err != nil {
			t.Error(err)
		}
	})
	return manager, events
}

func backgroundWaitState(t *testing.T, events <-chan BackgroundTaskState, status string) BackgroundTaskState {
	t.Helper()
	timeout := time.NewTimer(15 * time.Second)
	defer timeout.Stop()
	for {
		select {
		case state := <-events:
			if state.Status == status {
				return state
			}
		case <-timeout.C:
			t.Fatalf("task did not reach %s", status)
		}
	}
}

func backgroundWaitLog(t *testing.T, manager *BackgroundTasks, state BackgroundTaskState, text string) BackgroundTaskLog {
	t.Helper()
	deadline := time.Now().Add(15 * time.Second)
	for {
		log, err := manager.ReadLog(state.RepoID, state.TaskID, state.RunID, -1)
		if err != nil {
			t.Fatal(err)
		}
		if strings.Contains(log.Text, text) {
			return log
		}
		if time.Now().After(deadline) {
			t.Fatalf("missing output %q: %s", text, log.Text)
		}
		time.Sleep(10 * time.Millisecond)
	}
}

func TestBackgroundTasksLifecycleAndIsolation(t *testing.T) {
	manager, events := backgroundTestManager(t)
	request := backgroundTestRequest(t, "tree")
	state, err := manager.Start(request)
	if err != nil {
		t.Fatal(err)
	}
	log := backgroundWaitLog(t, manager, state, "CHILD=")
	match := regexp.MustCompile(`CHILD=(\d+)`).FindStringSubmatch(log.Text)
	if len(match) != 2 {
		t.Fatalf("no child identity: %s", log.Text)
	}
	pid, _ := strconv.Atoi(match[1])
	assertChildStopped := watchBackgroundProcess(t, pid)
	duplicate, err := manager.Start(request)
	if err != nil || duplicate.RunID != state.RunID || len(manager.List()) != 1 {
		t.Fatal("duplicate start created another task")
	}
	other := backgroundTestRequest(t, "wait")
	other.RepoID = "other"
	otherState, err := manager.Start(other)
	if err != nil {
		t.Fatal(err)
	}
	backgroundWaitLog(t, manager, otherState, "READY")
	if err := manager.Forget(state.RepoID, state.TaskID); err == nil {
		t.Fatal("deleted a running task")
	}
	if err := manager.Stop(state.RepoID, state.TaskID); err != nil {
		t.Fatal(err)
	}
	ended := backgroundWaitState(t, events, "stopped")
	if ended.RepoID != state.RepoID {
		t.Fatal("stopped the wrong project")
	}
	assertChildStopped()
	if len(manager.List()) != 2 {
		t.Fatal("lost another project")
	}
	if err := manager.Stop("missing", "task"); err == nil {
		t.Fatal("unknown stop succeeded")
	}
	if err := manager.Stop(state.RepoID, state.TaskID); err == nil {
		t.Fatal("ended stop succeeded")
	}
	if err := manager.Forget(state.RepoID, state.TaskID); err != nil {
		t.Fatal(err)
	}
	if _, err := manager.ReadLog(state.RepoID, state.TaskID, state.RunID, -1); err == nil {
		t.Fatal("deleted task retained logs")
	}
	if err := manager.Close(); err != nil {
		t.Fatal(err)
	}
	if len(manager.List()) != 0 {
		t.Fatal("shutdown retained tasks")
	}
	if _, err := manager.Start(other); err == nil {
		t.Fatal("started after shutdown")
	}
}

func TestBackgroundTasksTailExitRestartAndFailure(t *testing.T) {
	manager, events := backgroundTestManager(t)
	request := backgroundTestRequest(t, "emit")
	state, err := manager.Start(request)
	if err != nil {
		t.Fatal(err)
	}
	finished := backgroundWaitState(t, events, "exited")
	log, err := manager.ReadLog(state.RepoID, state.TaskID, state.RunID, -1)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(log.Text, "TAIL中文") || !strings.Contains(log.Text, "STDERR") || !log.Truncated || len(log.Text) > BackgroundTaskLogBytes || finished.ExitCode == nil || *finished.ExitCode != 0 {
		t.Fatalf("missing tail, stderr or bounded output: %d bytes, state %+v", len(log.Text), finished)
	}
	request.Command = backgroundTestRequest(t, "fail").Command
	restarted, err := manager.Start(request)
	if err != nil {
		t.Fatal(err)
	}
	failed := backgroundWaitState(t, events, "failed")
	if restarted.RunID == state.RunID || failed.ExitCode == nil || *failed.ExitCode != 7 || failed.Error == "" {
		t.Fatalf("failed run lost identity or error: %+v", failed)
	}
	if _, err := manager.ReadLog(state.RepoID, state.TaskID, state.RunID, 0); err == nil {
		t.Fatal("old run read new output")
	}
	newLog, err := manager.ReadLog(state.RepoID, state.TaskID, restarted.RunID, -1)
	if err != nil || !strings.Contains(newLog.Text, "EXPECTED_FAILURE") || strings.Contains(newLog.Text, "TAIL") {
		t.Fatal("restart mixed output from separate runs")
	}
}

func TestBackgroundTasksParentExitReclaimsDescendants(t *testing.T) {
	manager, events := backgroundTestManager(t)
	request := backgroundTestRequest(t, "orphan")
	state, err := manager.Start(request)
	if err != nil {
		t.Fatal(err)
	}
	backgroundWaitState(t, events, "exited")
	log, err := manager.ReadLog(state.RepoID, state.TaskID, state.RunID, -1)
	if err != nil {
		t.Fatal(err)
	}
	match := regexp.MustCompile(`CHILD=(\d+)`).FindStringSubmatch(log.Text)
	if len(match) != 2 {
		t.Fatalf("missing child: %s", log.Text)
	}
	pid, _ := strconv.Atoi(match[1])
	watchBackgroundProcess(t, pid)()
}

func TestBackgroundTasksDirectoryBoundary(t *testing.T) {
	root := t.TempDir()
	if err := os.Mkdir(filepath.Join(root, "frontend"), 0700); err != nil {
		t.Fatal(err)
	}
	if _, err := taskWorkingDirectory(root, "frontend"); err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{"..", filepath.Dir(root), "missing"} {
		if _, err := taskWorkingDirectory(root, path); err == nil {
			t.Fatalf("accepted %s", path)
		}
	}
	file := filepath.Join(root, "file")
	if err := os.WriteFile(file, []byte("test"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := taskWorkingDirectory(root, "file"); err == nil {
		t.Fatal("accepted a file as cwd")
	}
	// Rule: 无符号链接权限的 Windows 环境仍覆盖路径穿越，其余环境额外覆盖链接越界。
	if err := os.Symlink(t.TempDir(), filepath.Join(root, "outside")); err == nil {
		if _, err := taskWorkingDirectory(root, "outside"); err == nil {
			t.Fatal("accepted symlink escape")
		}
	}
}

func BenchmarkBackgroundTaskLogWrite(b *testing.B) {
	var log taskLog
	chunk := strings.Repeat("x", 4096)
	log.write(chunk)
	b.SetBytes(int64(len(chunk)))
	b.ReportAllocs()
	b.ResetTimer()
	for b.Loop() {
		log.write(chunk)
	}
}

func BenchmarkBackgroundTaskLogIncrement(b *testing.B) {
	var log taskLog
	chunk := strings.Repeat("x", 4096)
	log.write(strings.Repeat("x", BackgroundTaskLogBytes))
	cursor := log.end
	b.SetBytes(int64(len(chunk)))
	b.ReportAllocs()
	b.ResetTimer()
	for b.Loop() {
		log.write(chunk)
		cursor = log.read(cursor).Cursor
	}
}
