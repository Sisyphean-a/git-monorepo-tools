//go:build windows

package main

import (
	"errors"
	"path/filepath"
	"testing"
)

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
