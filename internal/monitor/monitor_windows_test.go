package monitor

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"testing"
	"time"
	"unsafe"
)

func TestSnapshotReadsActualProcessAndSystem(t *testing.T) {
	got, err := ReadSnapshot()
	if err != nil {
		t.Fatal(err)
	}
	if got.Main.PID != uint32(os.Getpid()) || got.Main.Name == "" || got.Main.WorkingSetBytes == nil || *got.Main.WorkingSetBytes == 0 || got.Main.PrivateBytes == nil || got.Main.HandleCount == nil {
		t.Fatalf("invalid own process data: %+v", got.Main)
	}
	if got.System.TotalBytes == 0 || got.System.NonpagedPoolBytes == 0 || got.Go.HeapBytes == 0 || got.Go.Goroutines == 0 || got.LogicalCPUs == 0 {
		t.Fatalf("invalid snapshot: %+v", got)
	}
	if _, err := json.Marshal(got); err != nil {
		t.Fatal(err)
	}
}

func TestSnapshotDoesNotLeakQueryHandles(t *testing.T) {
	// Rule: 固定线程并预热运行时，排除 Go 新建线程本身的事件与线程句柄。
	old := runtime.GOMAXPROCS(1)
	defer runtime.GOMAXPROCS(old)
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	for range 2 {
		if _, err := ReadSnapshot(); err != nil {
			t.Fatal(err)
		}
	}
	before, err := ReadSnapshot()
	if err != nil {
		t.Fatal(err)
	}
	for range 30 {
		if _, err := ReadSnapshot(); err != nil {
			t.Fatal(err)
		}
	}
	after, err := ReadSnapshot()
	if err != nil {
		t.Fatal(err)
	}
	if *after.Main.HandleCount > *before.Main.HandleCount {
		t.Fatalf("query leaked handles: %d -> %d", *before.Main.HandleCount, *after.Main.HandleCount)
	}
}

func TestMonitorChildHelper(t *testing.T) {
	if os.Getenv("MONITOR_CHILD_HELPER") != "1" {
		return
	}
	fmt.Println("ready")
	time.Sleep(30 * time.Second)
}

func TestSnapshotIncludesLiveChildrenAndOmitsExitedChildren(t *testing.T) {
	cmd := exec.Command(os.Args[0], "-test.run=^TestMonitorChildHelper$")
	cmd.Env = append(os.Environ(), "MONITOR_CHILD_HELPER=1")
	output, err := cmd.StdoutPipe()
	if err != nil {
		t.Fatal(err)
	}
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	stopped := false
	defer func() {
		if !stopped {
			_ = cmd.Process.Kill()
			_ = cmd.Wait()
		}
	}()
	if _, err := bufio.NewReader(output).ReadString('\n'); err != nil {
		t.Fatal(err)
	}
	snapshot, err := ReadSnapshot()
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, child := range snapshot.Children {
		if child.PID == uint32(cmd.Process.Pid) {
			found = true
			if child.Error != "" || child.PrivateBytes == nil || child.ParentPID != uint32(os.Getpid()) {
				t.Fatalf("child unreadable: %+v", child)
			}
		}
	}
	if !found {
		t.Fatal("live child omitted")
	}
	_ = cmd.Process.Kill()
	_ = cmd.Wait()
	stopped = true
	snapshot, err = ReadSnapshot()
	if err != nil {
		t.Fatal(err)
	}
	for _, child := range snapshot.Children {
		if child.PID == uint32(cmd.Process.Pid) {
			t.Fatal("exited child retained")
		}
	}
}

func TestNativeMemoryStructureSizes(t *testing.T) {
	processSize, systemSize := uintptr(80), uintptr(104)
	if unsafe.Sizeof(uintptr(0)) == 4 {
		processSize, systemSize = 44, 56
	}
	if unsafe.Sizeof(processMemory{}) != processSize || unsafe.Sizeof(performanceInfo{}) != systemSize {
		t.Fatal("Win32 ABI layout does not match")
	}
}
