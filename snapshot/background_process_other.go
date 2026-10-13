//go:build !windows

package snapshot

import (
	"errors"
	"os/exec"
	"sync"
	"syscall"
)

type taskProcess struct {
	mu  sync.Mutex
	cmd *exec.Cmd
}

func startTaskProcess(cmd *exec.Cmd) (*taskProcess, error) {
	applyBackgroundProcessAttrs(cmd)
	if err := cmd.Start(); err != nil {
		return nil, err
	}
	return &taskProcess{cmd: cmd}, nil
}

func (p *taskProcess) stop() error {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.cmd == nil {
		return nil
	}
	err := terminateCommandTree(p.cmd)
	if errors.Is(err, syscall.ESRCH) {
		return nil
	}
	return err
}

func (p *taskProcess) close() error {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.cmd == nil {
		return nil
	}
	err := terminateCommandTree(p.cmd)
	if errors.Is(err, syscall.ESRCH) {
		err = nil
	}
	if err == nil {
		p.cmd = nil
	}
	return err
}
