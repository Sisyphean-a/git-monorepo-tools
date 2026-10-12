package desktop

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
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

func (Client) OpenLocalPath(targetPath string) error {
	path, _, err := ensureOpenableDesktopPath(targetPath)
	if err != nil {
		return err
	}
	return startDetached("explorer.exe", toWindowsPath(path))
}

// RevealInExplorer 在系统文件管理器中定位目标：目录直接打开，文件打开所在目录并选中该文件。
func (Client) RevealInExplorer(targetPath string) error {
	path, info, err := ensureOpenableDesktopPath(targetPath)
	if err != nil {
		return err
	}
	return startCommand(newExplorerRevealCommand(path, info.IsDir()))
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

// Rule: 目录在资源管理器中直接打开，文件要求定位并选中，避免转交给系统默认程序。
func newExplorerRevealCommand(targetPath string, isDir bool) *exec.Cmd {
	winPath := toWindowsPath(targetPath)
	if isDir {
		return exec.Command("explorer.exe", winPath)
	}
	return exec.Command("explorer.exe", "/select,"+winPath)
}

func ensureDesktopPath(targetPath string) (string, error) {
	trimmed := strings.TrimSpace(targetPath)
	if trimmed == "" {
		return "", errors.New("缺少目标路径")
	}
	return trimmed, nil
}

func ensureOpenableDesktopPath(targetPath string) (string, os.FileInfo, error) {
	path, err := ensureDesktopPath(targetPath)
	if err != nil {
		return "", nil, err
	}
	if !filepath.IsAbs(path) {
		return "", nil, errors.New("本地链接必须是绝对路径")
	}
	path = filepath.Clean(path)
	info, err := os.Stat(path)
	if err != nil {
		return "", nil, fmt.Errorf("本地链接不可打开：%w", err)
	}
	return path, info, nil
}

func toWindowsPath(targetPath string) string {
	return strings.ReplaceAll(targetPath, "/", "\\")
}

func normalizeDesktopPath(targetPath string) string {
	return strings.ReplaceAll(targetPath, "\\", "/")
}
