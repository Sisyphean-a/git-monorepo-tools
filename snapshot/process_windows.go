//go:build windows

package snapshot

import (
	"os/exec"
	"strconv"
	"syscall"
)

const createNoWindow = 0x08000000

func applyBackgroundProcessAttrs(cmd *exec.Cmd) {
	attrs := cmd.SysProcAttr
	if attrs == nil {
		attrs = &syscall.SysProcAttr{}
	}
	attrs.HideWindow = true
	attrs.CreationFlags |= createNoWindow
	cmd.SysProcAttr = attrs
}

func terminateCommandTree(cmd *exec.Cmd) error {
	if cmd.Process == nil {
		return nil
	}
	killer := exec.Command("taskkill", "/PID", strconv.Itoa(cmd.Process.Pid), "/T", "/F")
	applyBackgroundProcessAttrs(killer)
	return killer.Run()
}
