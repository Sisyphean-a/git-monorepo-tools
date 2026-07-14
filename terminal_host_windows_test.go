//go:build windows

package main

import (
	"errors"
	"path/filepath"
	"strings"
	"testing"
)

func TestPowerShellTerminalBootstrapDoesNotBindShiftEnter(t *testing.T) {
	bootstrap := buildPowerShellTerminalBootstrapCommand()
	if strings.Contains(bootstrap, "PSREADLINE_VTINPUT") || strings.Contains(bootstrap, "AddLine") {
		t.Fatalf("bootstrap still contains Shift+Enter support: %q", bootstrap)
	}
}

func TestWindowsPowerShellTerminalEnvironmentUsesBuiltInPSReadLine(t *testing.T) {
	environment, err := powerShellTerminalProcessEnvironment("powershell", []string{
		"PSModulePath=C:\\Program Files\\PowerShell\\7\\Modules",
		"Path=C:\\Windows\\System32",
	}, func(name string) string {
		switch name {
		case "ProgramFiles":
			return `C:\Program Files`
		case "SystemRoot":
			return `C:\Windows`
		default:
			return ""
		}
	})
	if err != nil {
		t.Fatalf("build PowerShell environment: %v", err)
	}

	var modulePath, vtInput string
	for _, entry := range environment {
		parts := strings.SplitN(entry, "=", 2)
		if len(parts) != 2 {
			continue
		}
		switch parts[0] {
		case "PSModulePath":
			modulePath = parts[1]
		case "PSREADLINE_VTINPUT":
			vtInput = parts[1]
		}
	}

	expectedModulePath := `C:\Program Files\WindowsPowerShell\Modules;C:\Windows\System32\WindowsPowerShell\v1.0\Modules`
	if modulePath != expectedModulePath {
		t.Fatalf("unexpected Windows PowerShell module path %q", modulePath)
	}
	if vtInput != "" {
		t.Fatalf("expected no process VT input flag, got %q", vtInput)
	}
}

func TestResolveWindowsTerminalShellPrefersPwshAndLoadsProfile(t *testing.T) {
	t.Parallel()

	pwshPath := filepath.Join(`C:\Program Files\PowerShell\7`, "pwsh.exe")
	powershellPath := filepath.Join(`C:\Windows\System32\WindowsPowerShell\v1.0`, "powershell.exe")

	path, args, label, err := resolveWindowsTerminalShellWithLookPath(func(command string) (string, error) {
		switch command {
		case "pwsh.exe":
			return pwshPath, nil
		case "powershell.exe":
			return powershellPath, nil
		default:
			return "", errors.New("not found")
		}
	})
	if err != nil {
		t.Fatalf("resolve shell: %v", err)
	}
	if path != pwshPath {
		t.Fatalf("expected pwsh path %q, got %q", pwshPath, path)
	}
	if label != "pwsh" {
		t.Fatalf("expected pwsh label, got %q", label)
	}
	if len(args) != 4 || args[0] != "-NoLogo" || args[1] != "-NoExit" || args[2] != "-Command" {
		t.Fatalf("unexpected pwsh args %#v", args)
	}
	if args[3] != buildPowerShellTerminalBootstrapCommand() {
		t.Fatalf("unexpected bootstrap command %q", args[3])
	}
}

func TestResolveWindowsTerminalShellFallsBackToWindowsPowerShell(t *testing.T) {
	t.Parallel()

	powershellPath := filepath.Join(`C:\Windows\System32\WindowsPowerShell\v1.0`, "powershell.exe")

	path, args, label, err := resolveWindowsTerminalShellWithLookPath(func(command string) (string, error) {
		switch command {
		case "pwsh.exe":
			return "", errors.New("not found")
		case "powershell.exe":
			return powershellPath, nil
		default:
			return "", errors.New("not found")
		}
	})
	if err != nil {
		t.Fatalf("resolve shell: %v", err)
	}
	if path != powershellPath {
		t.Fatalf("expected powershell path %q, got %q", powershellPath, path)
	}
	if label != "powershell" {
		t.Fatalf("expected powershell label, got %q", label)
	}
	if len(args) != 4 || args[0] != "-NoLogo" || args[1] != "-NoExit" || args[2] != "-Command" {
		t.Fatalf("unexpected powershell args %#v", args)
	}
	if args[3] != buildPowerShellTerminalBootstrapCommand() {
		t.Fatalf("unexpected bootstrap command %q", args[3])
	}
}
