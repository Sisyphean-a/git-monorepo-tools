//go:build !windows

package snapshot

import (
	"os/exec"
	"syscall"
)

func applyBackgroundProcessAttrs(cmd *exec.Cmd) {
	attrs := cmd.SysProcAttr
	if attrs == nil {
		attrs = &syscall.SysProcAttr{}
	}
	attrs.Setpgid = true
	cmd.SysProcAttr = attrs
}

func terminateCommandTree(cmd *exec.Cmd) error {
	if cmd.Process == nil {
		return nil
	}
	return syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
}
