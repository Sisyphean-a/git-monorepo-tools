package terminal

import (
	"bufio"
	"fmt"
	"os"
	"os/exec"
	"testing"
	"time"

	"golang.org/x/sys/windows"
)

func TestResourceQueryHelper(t *testing.T) {
	if os.Getenv("TERMINAL_RESOURCE_HELPER") != "1" {
		return
	}
	fmt.Println("ready")
	time.Sleep(30 * time.Second)
}

func resourceQueryProcess(t *testing.T) *exec.Cmd {
	t.Helper()
	cmd := exec.Command(os.Args[0], "-test.run=^TestResourceQueryHelper$")
	cmd.Env = append(os.Environ(), "TERMINAL_RESOURCE_HELPER=1")
	output, err := cmd.StdoutPipe()
	if err != nil {
		t.Fatal(err)
	}
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = cmd.Process.Kill(); _ = cmd.Wait() })
	if _, err := bufio.NewReader(output).ReadString('\n'); err != nil {
		t.Fatal(err)
	}
	return cmd
}

func TestResourceProcessesReadsOwnedJobAndSynchronizesClosing(t *testing.T) {
	first, second := resourceQueryProcess(t), resourceQueryProcess(t)
	rootHandle, err := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION|windows.PROCESS_SET_QUOTA|windows.PROCESS_TERMINATE|windows.SYNCHRONIZE, false, uint32(first.Process.Pid))
	if err != nil {
		t.Fatal(err)
	}
	job, err := createKillOnCloseJob(rootHandle)
	if err != nil {
		_ = windows.CloseHandle(rootHandle)
		t.Fatal(err)
	}
	host := &conptyHost{process: rootHandle, job: job}
	secondHandle, err := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION|windows.PROCESS_SET_QUOTA|windows.PROCESS_TERMINATE, false, uint32(second.Process.Pid))
	if err != nil {
		_ = windows.CloseHandle(job)
		_ = windows.CloseHandle(rootHandle)
		t.Fatal(err)
	}
	err = windows.AssignProcessToJobObject(job, secondHandle)
	_ = windows.CloseHandle(secondHandle)
	if err != nil {
		_ = windows.CloseHandle(job)
		_ = windows.CloseHandle(rootHandle)
		t.Fatal(err)
	}
	waited := make(chan error, 1)
	go func() { _, err := host.Wait(); waited <- err }()
	t.Cleanup(func() { _ = host.Kill(); <-waited })
	root, members, err := host.ResourceProcesses()
	if err != nil {
		t.Fatal(err)
	}
	if root.PID != uint32(first.Process.Pid) || root.CreatedAt == 0 || len(members) != 2 {
		t.Fatalf("Job query must resize and retain exact process identities: root=%+v members=%+v", root, members)
	}
	found := map[uint32]bool{}
	for _, member := range members {
		if member.CreatedAt == 0 {
			t.Fatal("members must include creation time, not only PID")
		}
		found[member.PID] = true
	}
	if !found[uint32(first.Process.Pid)] || !found[uint32(second.Process.Pid)] {
		t.Fatal("owned Job members were omitted")
	}
	queryStarted, queryEnded := make(chan struct{}), make(chan struct{})
	go func() {
		defer close(queryEnded)
		close(queryStarted)
		for {
			if _, _, err := host.ResourceProcesses(); err != nil {
				return
			}
		}
	}()
	<-queryStarted
	if err := host.Kill(); err != nil {
		t.Fatal(err)
	}
	// Flow: 等待句柄回收完成，再证明读接口明确报告结束，不查询已回收后可能被复用的句柄。
	deadline := time.Now().Add(2 * time.Second)
	for {
		host.handlesMu.RLock()
		closed := host.handlesClosed
		host.handlesMu.RUnlock()
		if closed {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("Wait did not close the owned Job and process handles")
		}
		time.Sleep(time.Millisecond)
	}
	select {
	case <-queryEnded:
	case <-time.After(2 * time.Second):
		t.Fatal("concurrent Job reader did not finish after handle closure")
	}
	if _, _, err := host.ResourceProcesses(); err == nil {
		t.Fatal("a closed terminal must not publish fabricated empty membership")
	}
	if err := host.Kill(); err != nil {
		t.Fatalf("closing an already-ended host must be idempotent: %v", err)
	}
}
