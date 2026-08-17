package desktop

import (
	"os"
	"path/filepath"
	"testing"
)

func TestEnsureDesktopPathRejectsEmptyValue(t *testing.T) {
	t.Parallel()

	if _, err := ensureDesktopPath("   "); err == nil {
		t.Fatal("expected empty path to fail")
	}
}

func TestEnsureOpenableDesktopPathRequiresExistingAbsolutePath(t *testing.T) {
	t.Parallel()

	filePath := filepath.Join(t.TempDir(), "report.txt")
	if err := os.WriteFile(filePath, []byte("report"), 0o600); err != nil {
		t.Fatalf("write temp file: %v", err)
	}

	resolved, err := ensureOpenableDesktopPath(filePath)
	if err != nil {
		t.Fatalf("expected existing absolute file path to be accepted: %v", err)
	}
	if resolved != filepath.Clean(filePath) {
		t.Fatalf("expected cleaned path %q, got %q", filepath.Clean(filePath), resolved)
	}
	if _, err := ensureOpenableDesktopPath(filepath.Dir(filePath)); err != nil {
		t.Fatalf("expected existing directory to be accepted: %v", err)
	}
	if _, err := ensureOpenableDesktopPath("relative.txt"); err == nil {
		t.Fatal("expected relative path to be rejected")
	}
	if _, err := ensureOpenableDesktopPath(filepath.Join(t.TempDir(), "missing.txt")); err == nil {
		t.Fatal("expected missing path to be rejected")
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

func TestNewInteractiveCmdCommandKeepsWorkingDirectoryAndArgs(t *testing.T) {
	t.Parallel()

	cmd := newInteractiveCmdCommand(`C:\repo`)

	if cmd.Dir != `C:\repo` {
		t.Fatalf("expected working dir to be preserved, got %q", cmd.Dir)
	}
	if len(cmd.Args) != 4 {
		t.Fatalf("expected 4 args, got %d", len(cmd.Args))
	}
	if cmd.Args[0] != "cmd.exe" || cmd.Args[1] != "/D" || cmd.Args[2] != "/K" || cmd.Args[3] != `cd /d "C:\repo"` {
		t.Fatalf("unexpected args: %#v", cmd.Args)
	}
}

func TestNewWorkingDirCommandKeepsWorkingDirectory(t *testing.T) {
	t.Parallel()

	cmd := newWorkingDirCommand("wt.exe", `C:\repo`, "-d", `C:\repo`)
	if cmd.Dir != `C:\repo` {
		t.Fatalf("expected working dir to be preserved, got %q", cmd.Dir)
	}
	if len(cmd.Args) != 3 {
		t.Fatalf("unexpected args: %#v", cmd.Args)
	}
}
