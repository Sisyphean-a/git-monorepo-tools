//go:build windows

package snapshot

import (
	"os/exec"
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
