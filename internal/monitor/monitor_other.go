//go:build !windows

package monitor

import "errors"

func readPlatformSnapshot(bool, []TerminalScope) (Snapshot, error) {
	return Snapshot{}, errors.New("资源监控目前仅支持 Windows")
}
