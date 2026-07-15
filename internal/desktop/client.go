package desktop

import (
	"context"
	"errors"
	"os/exec"
	"strings"

	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

type Client struct{}

func New() Client {
	return Client{}
}

func (Client) PickFolder(ctx context.Context) (string, error) {
	selected, err := wruntime.OpenDirectoryDialog(ctx, wruntime.OpenDialogOptions{
		Title:                "选择要添加的目录",
		CanCreateDirectories: true,
	})
	if err != nil {
		return "", err
	}
	return normalizeDesktopPath(selected), nil
}

func (Client) OpenFolder(targetPath string) error {
	path, err := ensureDesktopPath(targetPath)
	if err != nil {
		return err
	}
	return startDetached("explorer.exe", toWindowsPath(path))
}

func (Client) OpenTerminal(targetPath string) error {
	path, err := ensureDesktopPath(targetPath)
	if err != nil {
		return err
	}
	workingDir := toWindowsPath(path)
	return startFirstAvailableCommand(
		newWorkingDirCommand("wt.exe", workingDir, "-d", workingDir),
		newInteractiveCmdCommand(workingDir),
	)
}

func (Client) OpenConflicts(targetPath string) error {
	path, err := ensureDesktopPath(targetPath)
	if err != nil {
		return err
	}
	return startInteractivePowerShell(toWindowsPath(path), "-NoLogo", "-NoExit", "-Command", "git mergetool")
}

func startDetached(command string, args ...string) error {
	cmd := exec.Command(command, args...)
	return startCommand(cmd)
}

func startFirstAvailableCommand(commands ...*exec.Cmd) error {
	var lastErr error
	for _, cmd := range commands {
		if cmd == nil {
			continue
		}
		if err := startCommand(cmd); err != nil {
			lastErr = err
			continue
		}
		return nil
	}
	if lastErr != nil {
		return lastErr
	}
	return errors.New("没有可用的终端启动方式")
}

func startInteractivePowerShell(workingDir string, args ...string) error {
	return startCommand(newInteractivePowerShellCommand(workingDir, args...))
}

func startCommand(cmd *exec.Cmd) error {
	if err := cmd.Start(); err != nil {
		return err
	}
	return cmd.Process.Release()
}

func newInteractivePowerShellCommand(workingDir string, args ...string) *exec.Cmd {
	cmd := newWorkingDirCommand("powershell.exe", workingDir, args...)
	applyInteractiveProcessAttrs(cmd)
	return cmd
}

func newInteractiveCmdCommand(workingDir string) *exec.Cmd {
	cmd := newWorkingDirCommand("cmd.exe", workingDir, "/D", "/K", `cd /d "`+workingDir+`"`)
	applyInteractiveProcessAttrs(cmd)
	return cmd
}

func newWorkingDirCommand(command string, workingDir string, args ...string) *exec.Cmd {
	cmd := exec.Command(command, args...)
	cmd.Dir = workingDir
	return cmd
}

func ensureDesktopPath(targetPath string) (string, error) {
	trimmed := strings.TrimSpace(targetPath)
	if trimmed == "" {
		return "", errors.New("缺少目标路径")
	}
	return trimmed, nil
}

func toWindowsPath(targetPath string) string {
	return strings.ReplaceAll(targetPath, "/", "\\")
}

func normalizeDesktopPath(targetPath string) string {
	return strings.ReplaceAll(targetPath, "\\", "/")
}
