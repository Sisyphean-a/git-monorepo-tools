package main

import "testing"

func TestEnsureDesktopPathRejectsEmptyValue(t *testing.T) {
	t.Parallel()

	if _, err := ensureDesktopPath("   "); err == nil {
		t.Fatal("expected empty path to fail")
	}
}

func TestNewInteractivePowerShellCommandKeepsWorkingDirectoryAndArgs(t *testing.T) {
	t.Parallel()

	cmd := newInteractivePowerShellCommand(`C:\repo`, "-NoLogo", "-NoExit")

	if cmd.Dir != `C:\repo` {
		t.Fatalf("expected working dir to be preserved, got %q", cmd.Dir)
	}
	if len(cmd.Args) != 3 {
		t.Fatalf("expected 3 args, got %d", len(cmd.Args))
	}
	if cmd.Args[0] != "powershell.exe" || cmd.Args[1] != "-NoLogo" || cmd.Args[2] != "-NoExit" {
		t.Fatalf("unexpected args: %#v", cmd.Args)
	}
}
