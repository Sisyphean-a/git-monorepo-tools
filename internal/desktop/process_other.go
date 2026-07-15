//go:build !windows

package desktop

import "os/exec"

func applyInteractiveProcessAttrs(cmd *exec.Cmd) {
	_ = cmd
}
