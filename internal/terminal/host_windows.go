//go:build windows

package terminal

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"syscall"
	"unsafe"

	"github.com/charmbracelet/x/conpty"
	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
)

type conptyHost struct {
	pty     *conpty.ConPty
	process windows.Handle
	job     windows.Handle

	closeOnce sync.Once
}

type windowsEnvironmentVariable struct {
	name   string
	value  string
	expand bool
}

var windowsEnvironmentReferencePattern = regexp.MustCompile(`%([^%]+)%`)

type windowsPersistentEnvironmentSnapshot struct {
	system []windowsEnvironmentVariable
	user   []windowsEnvironmentVariable
	err    error
}

// Guarantee: this startup snapshot lets later terminal launches remove persistent variables
// that a user deleted after the desktop application had already inherited them.
var initialWindowsPersistentEnvironment = loadWindowsPersistentEnvironment()

func newTerminalHost(repoPath string, cols, rows int) (terminalHost, string, error) {
	workingDir := filepath.Clean(repoPath)
	shellPath, shellArgs, shellLabel, err := resolveWindowsTerminalShell()
	if err != nil {
		return nil, "", err
	}
	processEnvironment, err := refreshedWindowsTerminalEnvironment(os.Environ(), initialWindowsPersistentEnvironment)
	if err != nil {
		return nil, "", err
	}
	processEnvironment, err = powerShellTerminalProcessEnvironment(
		shellLabel,
		processEnvironment,
		func(name string) string { return environmentVariableValue(processEnvironment, name) },
	)
	if err != nil {
		return nil, "", err
	}

	pty, err := conpty.New(cols, rows, 0)
	if err != nil {
		return nil, "", fmt.Errorf("创建 ConPTY 失败: %w", err)
	}

	argv := append([]string{shellPath}, shellArgs...)
	_, processHandle, err := pty.Spawn(shellPath, argv, &syscall.ProcAttr{
		Dir: workingDir,
		Env: processEnvironment,
	})
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

func refreshedWindowsTerminalEnvironment(
	environ []string,
	initial windowsPersistentEnvironmentSnapshot,
) ([]string, error) {
	current := loadWindowsPersistentEnvironment()
	if current.err != nil {
		return nil, current.err
	}
	return mergeWindowsPersistentEnvironment(environ, initial, current), nil
}

func loadWindowsPersistentEnvironment() windowsPersistentEnvironmentSnapshot {
	system, err := readWindowsEnvironmentRegistry(registry.LOCAL_MACHINE, `SYSTEM\CurrentControlSet\Control\Session Manager\Environment`)
	if err != nil {
		return windowsPersistentEnvironmentSnapshot{err: fmt.Errorf("读取系统环境变量失败: %w", err)}
	}
	user, err := readWindowsEnvironmentRegistry(registry.CURRENT_USER, `Environment`)
	if err != nil {
		return windowsPersistentEnvironmentSnapshot{err: fmt.Errorf("读取用户环境变量失败: %w", err)}
	}
	return windowsPersistentEnvironmentSnapshot{system: system, user: user}
}

func readWindowsEnvironmentRegistry(root registry.Key, path string) ([]windowsEnvironmentVariable, error) {
	key, err := registry.OpenKey(root, path, registry.QUERY_VALUE)
	if err != nil {
		return nil, err
	}
	defer key.Close()

	names, err := key.ReadValueNames(-1)
	if err != nil {
		return nil, err
	}
	variables := make([]windowsEnvironmentVariable, 0, len(names))
	for _, name := range names {
		value, valueType, err := key.GetStringValue(name)
		if errors.Is(err, registry.ErrUnexpectedType) {
			continue
		}
		if err != nil {
			return nil, err
		}
		variables = append(variables, windowsEnvironmentVariable{
			name: name, value: value, expand: valueType == registry.EXPAND_SZ,
		})
	}
	return variables, nil
}

func mergeWindowsPersistentEnvironment(
	environ []string,
	initial windowsPersistentEnvironmentSnapshot,
	current windowsPersistentEnvironmentSnapshot,
) []string {
	if initial.err == nil {
		currentNames := environmentVariableNames(current.system, current.user)
		initialNames := environmentVariableNames(initial.system, initial.user)
		environment := make([]string, 0, len(environ))
		for _, entry := range environ {
			name, _, found := strings.Cut(entry, "=")
			if found && initialNames[strings.ToUpper(name)] && !currentNames[strings.ToUpper(name)] {
				continue
			}
			environment = append(environment, entry)
		}
		environ = environment
	}

	for _, variable := range current.system {
		if !strings.EqualFold(variable.name, "Path") {
			environ = replaceEnvironmentVariable(environ, variable.name, variable.value)
		}
	}
	for _, variable := range current.user {
		if !strings.EqualFold(variable.name, "Path") {
			environ = replaceEnvironmentVariable(environ, variable.name, variable.value)
		}
	}

	systemPath, hasSystemPath := persistentEnvironmentValue(current.system, "Path")
	userPath, hasUserPath := persistentEnvironmentValue(current.user, "Path")
	switch {
	case hasSystemPath && hasUserPath:
		environ = replaceEnvironmentVariable(environ, "Path", userPath+";"+systemPath)
	case hasUserPath:
		environ = replaceEnvironmentVariable(environ, "Path", userPath)
	case hasSystemPath:
		environ = replaceEnvironmentVariable(environ, "Path", systemPath)
	}
	return expandWindowsPersistentEnvironmentValues(environ, current)
}

func expandWindowsPersistentEnvironmentValues(
	environ []string,
	current windowsPersistentEnvironmentSnapshot,
) []string {
	variables := effectiveWindowsPersistentEnvironmentVariables(current)
	for range 16 {
		changed := false
		for _, variable := range variables {
			if !variable.expand {
				continue
			}
			expanded := expandWindowsEnvironmentValue(variable.value, environ)
			if environmentVariableValue(environ, variable.name) != expanded {
				environ = replaceEnvironmentVariable(environ, variable.name, expanded)
				changed = true
			}
		}
		if !changed {
			return environ
		}
	}
	return environ
}

func effectiveWindowsPersistentEnvironmentVariables(
	current windowsPersistentEnvironmentSnapshot,
) []windowsEnvironmentVariable {
	variables := make([]windowsEnvironmentVariable, 0, len(current.system)+len(current.user))
	positions := make(map[string]int)
	setVariable := func(variable windowsEnvironmentVariable) {
		key := strings.ToUpper(variable.name)
		if index, found := positions[key]; found {
			variables[index] = variable
			return
		}
		positions[key] = len(variables)
		variables = append(variables, variable)
	}
	for _, variable := range current.system {
		if !strings.EqualFold(variable.name, "Path") {
			setVariable(variable)
		}
	}
	for _, variable := range current.user {
		if !strings.EqualFold(variable.name, "Path") {
			setVariable(variable)
		}
	}

	systemPath, hasSystemPath := persistentEnvironmentVariable(current.system, "Path")
	userPath, hasUserPath := persistentEnvironmentVariable(current.user, "Path")
	switch {
	case hasSystemPath && hasUserPath:
		setVariable(windowsEnvironmentVariable{
			name: "Path", value: userPath.value + ";" + systemPath.value, expand: userPath.expand || systemPath.expand,
		})
	case hasUserPath:
		setVariable(userPath)
	case hasSystemPath:
		setVariable(systemPath)
	}
	return variables
}

func expandWindowsEnvironmentValue(value string, environ []string) string {
	return windowsEnvironmentReferencePattern.ReplaceAllStringFunc(value, func(reference string) string {
		name := reference[1 : len(reference)-1]
		if expanded, found := environmentVariableValueExists(environ, name); found {
			return expanded
		}
		return reference
	})
}

func environmentVariableNames(groups ...[]windowsEnvironmentVariable) map[string]bool {
	names := make(map[string]bool)
	for _, group := range groups {
		for _, variable := range group {
			names[strings.ToUpper(variable.name)] = true
		}
	}
	return names
}

func persistentEnvironmentValue(variables []windowsEnvironmentVariable, name string) (string, bool) {
	variable, found := persistentEnvironmentVariable(variables, name)
	return variable.value, found
}

func persistentEnvironmentVariable(variables []windowsEnvironmentVariable, name string) (windowsEnvironmentVariable, bool) {
	for index := len(variables) - 1; index >= 0; index-- {
		if strings.EqualFold(variables[index].name, name) {
			return variables[index], true
		}
	}
	return windowsEnvironmentVariable{}, false
}

func environmentVariableValue(environ []string, name string) string {
	value, _ := environmentVariableValueExists(environ, name)
	return value
}

func environmentVariableValueExists(environ []string, name string) (string, bool) {
	for index := len(environ) - 1; index >= 0; index-- {
		key, value, found := strings.Cut(environ[index], "=")
		if found && strings.EqualFold(key, name) {
			return value, true
		}
	}
	return "", false
}

func powerShellTerminalProcessEnvironment(
	shellLabel string,
	environ []string,
	lookupEnv func(string) string,
) ([]string, error) {
	if shellLabel != "powershell" {
		return environ, nil
	}

	programFiles := lookupEnv("ProgramFiles")
	systemRoot := lookupEnv("SystemRoot")
	if programFiles == "" || systemRoot == "" {
		return nil, errors.New("启动 Windows PowerShell 时缺少系统模块目录环境变量")
	}
	modulePath := strings.Join([]string{
		filepath.Join(programFiles, "WindowsPowerShell", "Modules"),
		filepath.Join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "Modules"),
	}, ";")
	return replaceEnvironmentVariable(environ, "PSModulePath", modulePath), nil
}

func replaceEnvironmentVariable(environ []string, name, value string) []string {
	environment := make([]string, 0, len(environ)+1)
	for _, entry := range environ {
		key, _, found := strings.Cut(entry, "=")
		if found && strings.EqualFold(key, name) {
			continue
		}
		environment = append(environment, entry)
	}
	return append(environment, name+"="+value)
}

func buildPowerShellTerminalBootstrapCommand() string {
	return `Import-Module PSReadLine -ErrorAction Stop; ` +
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
