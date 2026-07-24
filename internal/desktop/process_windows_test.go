//go:build windows

package desktop

import (
	"strings"
	"testing"
)

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

func TestNewClipboardImageCommandUsesStaAndConfiguredOutputPath(t *testing.T) {
	t.Parallel()

	const imagePath = `C:\Users\tester\AppData\Local\Temp\clipboard.png`
	cmd := newClipboardImageCommand(imagePath)

	if got, want := cmd.Args[:5], []string{"powershell.exe", "-NoProfile", "-NonInteractive", "-STA", "-Command"}; !sameStrings(got, want) {
		t.Fatalf("unexpected PowerShell arguments: %#v", cmd.Args)
	}
	if !strings.Contains(cmd.Args[5], "Clipboard]::GetImage") {
		t.Fatalf("clipboard image command is missing image retrieval: %q", cmd.Args[5])
	}
	if !containsString(cmd.Env, clipboardImagePathEnvironment+"="+imagePath) {
		t.Fatalf("clipboard image path was not passed to PowerShell: %#v", cmd.Env)
	}
}

func sameStrings(got, want []string) bool {
	if len(got) != len(want) {
		return false
	}
	for index := range got {
		if got[index] != want[index] {
			return false
		}
	}
	return true
}

func containsString(values []string, want string) bool {
	for _, value := range values {
		if value == want {
			return true
		}
	}
	return false
}
