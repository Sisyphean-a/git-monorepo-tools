//go:build !windows

package snapshot

import (
	"errors"
	"syscall"
	"testing"
	"time"
)

func watchBackgroundProcess(t *testing.T, pid int) func() {
	t.Helper()
	return func() {
		t.Helper()
		deadline := time.Now().Add(5 * time.Second)
		for !errors.Is(syscall.Kill(pid, 0), syscall.ESRCH) {
			if time.Now().After(deadline) {
				t.Fatalf("child %d survived task cleanup", pid)
			}
			time.Sleep(10 * time.Millisecond)
		}
	}
}
