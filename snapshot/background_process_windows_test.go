//go:build windows

package snapshot

import (
	"testing"

	"golang.org/x/sys/windows"
)

func watchBackgroundProcess(t *testing.T, pid int) func() {
	t.Helper()
	handle, err := windows.OpenProcess(windows.SYNCHRONIZE, false, uint32(pid))
	if err == windows.ERROR_INVALID_PARAMETER {
		return func() {}
	}
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { windows.CloseHandle(handle) })
	return func() {
		t.Helper()
		status, err := windows.WaitForSingleObject(handle, 5000)
		if err != nil || status != windows.WAIT_OBJECT_0 {
			t.Fatalf("child %d survived task cleanup: status=%v error=%v", pid, status, err)
		}
	}
}
