//go:build windows

package desktop

import "testing"

func TestNewInteractivePowerShellCommandRequestsNewConsole(t *testing.T) {
	t.Parallel()

	cmd := newInteractivePowerShellCommand(`C:\repo`, "-NoLogo", "-NoExit")
	if cmd.SysProcAttr == nil {
		t.Fatal("expected SysProcAttr to be configured")
	}
	if cmd.SysProcAttr.CreationFlags&createNewConsole == 0 {
		t.Fatalf("expected CREATE_NEW_CONSOLE flag, got %#x", cmd.SysProcAttr.CreationFlags)
	}
}

func TestNewInteractiveCmdCommandRequestsNewConsole(t *testing.T) {
	t.Parallel()

	cmd := newInteractiveCmdCommand(`C:\repo`)
	if cmd.SysProcAttr == nil {
		t.Fatal("expected SysProcAttr to be configured")
	}
	if cmd.SysProcAttr.CreationFlags&createNewConsole == 0 {
		t.Fatalf("expected CREATE_NEW_CONSOLE flag, got %#x", cmd.SysProcAttr.CreationFlags)
	}
}
