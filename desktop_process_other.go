//go:build !windows

package main

import "os/exec"

func applyInteractiveProcessAttrs(cmd *exec.Cmd) {
	_ = cmd
}
