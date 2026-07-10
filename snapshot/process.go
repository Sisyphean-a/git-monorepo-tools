package snapshot

import (
	"os/exec"
	"time"
)

func waitForCommand(cmd *exec.Cmd, timeout time.Duration) (error, bool) {
	completed := make(chan error, 1)
	go func() {
		completed <- cmd.Wait()
	}()

	timer := time.NewTimer(timeout)
	defer timer.Stop()
	select {
	case err := <-completed:
		return err, false
	case <-timer.C:
		_ = terminateCommandTree(cmd)
		return <-completed, true
	}
}
