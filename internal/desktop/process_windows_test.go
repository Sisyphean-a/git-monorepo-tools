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

func TestClipboardImageFormatsAreRecognized(t *testing.T) {
	t.Parallel()

	const (
		clipboardFormatPNG      = 0xc001
		clipboardFormatImagePNG = 0xc002
	)
	formats := clipboardImageFormats(func(name string) uint32 {
		switch name {
		case "PNG":
			return clipboardFormatPNG
		case "image/png":
			return clipboardFormatImagePNG
		default:
			return 0
		}
	})
	for _, format := range []uint32{
		clipboardFormatBitmap,
		clipboardFormatDIB,
		clipboardFormatDIBV5,
		clipboardFormatPNG,
		clipboardFormatImagePNG,
	} {
		if !hasClipboardImage(formats, func(candidate uint32) bool {
			return candidate == format
		}) {
			t.Fatalf("expected clipboard format %d to be recognized as an image", format)
		}
	}
	if hasClipboardImage(formats, func(uint32) bool { return false }) {
		t.Fatal("unexpected image detection when no image formats are available")
	}
}

func TestRegisterClipboardImageFormatsUsesWindowsRegistry(t *testing.T) {
	t.Parallel()

	for _, name := range registeredClipboardImageFormatNames {
		if format := registerClipboardImageFormat(name); format < 0xc000 {
			t.Fatalf("expected registered clipboard format %q, got %#x", name, format)
		}
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
	if !strings.Contains(cmd.Args[5], "Save-RegisteredClipboardImage") {
		t.Fatalf("clipboard image command is missing registered PNG retrieval: %q", cmd.Args[5])
	}
	if !containsString(cmd.Env, clipboardImagePathEnvironment+"="+imagePath) {
		t.Fatalf("clipboard image path was not passed to PowerShell: %#v", cmd.Env)
	}
	if cmd.SysProcAttr == nil || !cmd.SysProcAttr.HideWindow {
		t.Fatal("clipboard image command must not create a visible console window")
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
