//go:build windows

package main

import (
	"errors"
	"fmt"
	"os/exec"
	"path/filepath"
	"sync"
	"syscall"
	"unsafe"

	"github.com/charmbracelet/x/conpty"
	"golang.org/x/sys/windows"
)

type conptyHost struct {
	pty     *conpty.ConPty
	process windows.Handle
	job     windows.Handle

	closeOnce sync.Once
}

func newTerminalHost(repoPath string, cols, rows int) (terminalHost, string, error) {
	workingDir := toWindowsPath(filepath.Clean(repoPath))
	shellPath, shellArgs, shellLabel, err := resolveWindowsTerminalShell()
	if err != nil {
		return nil, "", err
	}

	pty, err := conpty.New(cols, rows, 0)
	if err != nil {
		return nil, "", fmt.Errorf("创建 ConPTY 失败: %w", err)
	}

	argv := append([]string{shellPath}, shellArgs...)
	_, processHandle, err := pty.Spawn(shellPath, argv, &syscall.ProcAttr{Dir: workingDir})
	if err != nil {
		_ = pty.Close()
		return nil, "", fmt.Errorf("启动终端进程失败: %w", err)
	}

	host := &conptyHost{
		pty:     pty,
		process: windows.Handle(processHandle),
	}

	if host.job, err = createKillOnCloseJob(host.process); err != nil {
		_ = host.Kill()
		_ = host.Close()
		return nil, "", err
	}

	return host, shellLabel, nil
}

func (h *conptyHost) Read(buffer []byte) (int, error) {
	return h.pty.Read(buffer)
}

func (h *conptyHost) Write(data []byte) (int, error) {
	return h.pty.Write(data)
}

func (h *conptyHost) Resize(cols, rows int) error {
	return h.pty.Resize(cols, rows)
}

func (h *conptyHost) Wait() (int, error) {
	defer func() {
		_ = closeHandle(h.job)
		_ = closeHandle(h.process)
	}()

	status, err := windows.WaitForSingleObject(h.process, windows.INFINITE)
	if err != nil {
		return -1, err
	}
	if status != windows.WAIT_OBJECT_0 {
		return -1, fmt.Errorf("等待终端退出失败: %d", status)
	}

	var exitCode uint32
	if err := windows.GetExitCodeProcess(h.process, &exitCode); err != nil {
		return -1, err
	}
	return int(exitCode), nil
}

func (h *conptyHost) Kill() error {
	if h.job != 0 {
		return windows.TerminateJobObject(h.job, 1)
	}
	if h.process == 0 {
		return nil
	}
	return windows.TerminateProcess(h.process, 1)
}

func (h *conptyHost) Close() error {
	var closeErr error
	h.closeOnce.Do(func() {
		closeErr = h.pty.Close()
	})
	return closeErr
}

func buildPowerShellTerminalBootstrapCommand() string {
	return `Import-Module PSReadLine -ErrorAction SilentlyContinue; ` +
		`$__codexCtrlLHandler = $null; ` +
		`if (Get-Command Get-PSReadLineKeyHandler -ErrorAction SilentlyContinue) { ` +
		`$__codexCtrlLHandler = Get-PSReadLineKeyHandler | Where-Object { $_.Key -eq 'Ctrl+l' } | Select-Object -First 1; ` +
		`if ($__codexCtrlLHandler -and $__codexCtrlLHandler.Function -eq 'ClearScreen') { ` +
		`Set-PSReadLineKeyHandler -Chord Ctrl+l -BriefDescription 'Clear Screen' -Description 'Clear the screen and preserve terminal scrollback' -ScriptBlock { ` +
		`$__codexRows = [Math]::Max([Console]::WindowHeight, 1); ` +
		`[Console]::Write(("` + "`n" + `" * $__codexRows)); ` +
		`[Microsoft.PowerShell.PSConsoleReadLine]::ClearScreen($null, $null) ` +
		`}; ` +
		`}; ` +
		`}; ` +
		`Remove-Variable __codexCtrlLHandler, __codexRows -ErrorAction SilentlyContinue`
}

func resolveWindowsTerminalShell() (string, []string, string, error) {
	return resolveWindowsTerminalShellWithLookPath(exec.LookPath)
}

func resolveWindowsTerminalShellWithLookPath(
	lookPath func(string) (string, error),
) (string, []string, string, error) {
	candidates := []struct {
		command string
		args    []string
		label   string
	}{
		{
			command: "pwsh.exe",
			args:    []string{"-NoLogo", "-NoExit", "-Command", buildPowerShellTerminalBootstrapCommand()},
			label:   "pwsh",
		},
		{
			command: "powershell.exe",
			args:    []string{"-NoLogo", "-NoExit", "-Command", buildPowerShellTerminalBootstrapCommand()},
			label:   "powershell",
		},
	}

	for _, candidate := range candidates {
		path, err := lookPath(candidate.command)
		if err == nil {
			return path, candidate.args, candidate.label, nil
		}
	}

	return "", nil, "", errors.New("未找到 pwsh.exe 或 powershell.exe")
}

func createKillOnCloseJob(process windows.Handle) (windows.Handle, error) {
	job, err := windows.CreateJobObject(nil, nil)
	if err != nil {
		return 0, fmt.Errorf("创建终端 Job Object 失败: %w", err)
	}

	info := windows.JOBOBJECT_EXTENDED_LIMIT_INFORMATION{}
	info.BasicLimitInformation.LimitFlags = windows.JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
	_, err = windows.SetInformationJobObject(
		job,
		windows.JobObjectExtendedLimitInformation,
		uintptr(unsafe.Pointer(&info)),
		uint32(unsafe.Sizeof(info)),
	)
	if err != nil {
		_ = windows.CloseHandle(job)
		return 0, fmt.Errorf("配置终端 Job Object 失败: %w", err)
	}

	if err := windows.AssignProcessToJobObject(job, process); err != nil {
		_ = windows.CloseHandle(job)
		return 0, fmt.Errorf("绑定终端进程到 Job Object 失败: %w", err)
	}

	return job, nil
}

func closeHandle(handle windows.Handle) error {
	if handle == 0 {
		return nil
	}
	return windows.CloseHandle(handle)
}
