//go:build !windows

package terminal

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"syscall"

	"github.com/creack/pty"
)

type posixPtyHost struct {
	ptmx *os.File
	cmd  *exec.Cmd

	closeOnce sync.Once
}

func newTerminalHost(repoPath string, cols, rows int) (terminalHost, string, error) {
	shellPath, shellLabel, err := resolvePosixTerminalShell()
	if err != nil {
		return nil, "", err
	}

	cmd := exec.Command(shellPath)
	cmd.Dir = filepath.Clean(repoPath)
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	ptmx, err := pty.StartWithSize(cmd, &pty.Winsize{Cols: uint16(cols), Rows: uint16(rows)})
	if err != nil {
		return nil, "", err
	}

	return &posixPtyHost{ptmx: ptmx, cmd: cmd}, shellLabel, nil
}

func (h *posixPtyHost) Read(buffer []byte) (int, error) {
	return h.ptmx.Read(buffer)
}

func (h *posixPtyHost) Write(data []byte) (int, error) {
	return h.ptmx.Write(data)
}

func (h *posixPtyHost) Resize(cols, rows int) error {
	return pty.Setsize(h.ptmx, &pty.Winsize{Cols: uint16(cols), Rows: uint16(rows)})
}

func (h *posixPtyHost) Wait() (int, error) {
	err := h.cmd.Wait()
	if err == nil {
		return 0, nil
	}

	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		return exitErr.ExitCode(), nil
	}
	return -1, err
}

func (h *posixPtyHost) Kill() error {
	if h.cmd.Process == nil {
		return nil
	}
	if pgid, err := syscall.Getpgid(h.cmd.Process.Pid); err == nil {
		return syscall.Kill(-pgid, syscall.SIGKILL)
	}
	return h.cmd.Process.Kill()
}

func (h *posixPtyHost) Close() error {
	var closeErr error
	h.closeOnce.Do(func() {
		closeErr = h.ptmx.Close()
	})
	return closeErr
}

func resolvePosixTerminalShell() (string, string, error) {
	shell := os.Getenv("SHELL")
	if shell != "" {
		return shell, filepath.Base(shell), nil
	}
	for _, candidate := range []string{"bash", "sh"} {
		path, err := exec.LookPath(candidate)
		if err == nil {
			return path, filepath.Base(path), nil
		}
	}
	return "", "", errors.New("未找到可用 shell")
}
