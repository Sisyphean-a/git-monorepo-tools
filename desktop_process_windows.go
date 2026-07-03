//go:build windows

package main

import (
	"os/exec"
	"syscall"
)

const createNewConsole = 0x00000010

func applyInteractiveProcessAttrs(cmd *exec.Cmd) {
	attrs := cmd.SysProcAttr
	if attrs == nil {
		attrs = &syscall.SysProcAttr{}
	}
	attrs.CreationFlags |= createNewConsole
	cmd.SysProcAttr = attrs
}
