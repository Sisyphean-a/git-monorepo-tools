//go:build !windows

package snapshot

import "os/exec"

func applyBackgroundProcessAttrs(cmd *exec.Cmd) {}
