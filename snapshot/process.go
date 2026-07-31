package snapshot

import (
	"errors"
	"fmt"
	"os/exec"
	"sync"
	"time"
)

// commandKillGracePeriod 可注入以便测试加速
var commandKillGracePeriod = 5 * time.Second

// Flow: 超时后先杀进程树，再等待回收；终止失败时最多再等一个宽限期，避免调用永久挂起。
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
		killErr := terminateCommandTree(cmd)
		select {
		case <-completed:
			return nil, true
		case <-time.After(commandKillGracePeriod):
			if killErr != nil {
				return fmt.Errorf("命令超时后无法终止进程：%v", killErr), true
			}
			return errors.New("命令超时后进程未退出"), true
		}
	}
}

// Flow: 正常路径进程退出后流立即关闭；超时终止失败时流可能永不关闭，最多等待一个宽限期再返回。
func drainStreams(group *sync.WaitGroup) {
	done := make(chan struct{})
	go func() {
		group.Wait()
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(commandKillGracePeriod):
	}
}
