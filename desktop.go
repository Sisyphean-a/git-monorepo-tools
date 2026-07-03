package main

import (
	"errors"
	"os/exec"
	"strings"

	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

func (a *App) PickFolder() (string, error) {
	selected, err := wruntime.OpenDirectoryDialog(a.ctx, wruntime.OpenDialogOptions{
		Title:                "选择要添加的目录",
		CanCreateDirectories: true,
	})
	if err != nil {
		return "", err
	}
	return normalizeDesktopPath(selected), nil
}

func (a *App) OpenFolder(targetPath string) error {
	path, err := ensureDesktopPath(targetPath)
	if err != nil {
		return err
	}
	return startDetached("explorer.exe", toWindowsPath(path))
}

func (a *App) OpenTerminal(targetPath string) error {
	path, err := ensureDesktopPath(targetPath)
	if err != nil {
		return err
	}
	return startInteractivePowerShell(toWindowsPath(path), "-NoLogo", "-NoExit")
}

func (a *App) OpenConflicts(targetPath string) error {
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
	cmd := exec.Command("powershell.exe", args...)
	cmd.Dir = workingDir
	applyInteractiveProcessAttrs(cmd)
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
