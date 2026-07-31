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

// terminateCommandTree 可注入以便测试超时后无法终止的场景
var terminateCommandTree = defaultTerminateCommandTree

func defaultTerminateCommandTree(cmd *exec.Cmd) error {
	if cmd.Process == nil {
		return nil
	}
	killer := exec.Command("taskkill", "/PID", strconv.Itoa(cmd.Process.Pid), "/T", "/F")
	applyBackgroundProcessAttrs(killer)
	return killer.Run()
}
