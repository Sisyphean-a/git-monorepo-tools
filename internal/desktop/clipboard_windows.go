//go:build windows

package desktop

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"syscall"
)

const (
	clipboardImagePathEnvironment = "GIT_MONOREPO_TOOLS_CLIPBOARD_IMAGE_PATH"
	clipboardFormatBitmap         = 2
	clipboardFormatDIB            = 8
	clipboardFormatDIBV5          = 17
)

var isClipboardFormatAvailable = syscall.NewLazyDLL("user32.dll").NewProc("IsClipboardFormatAvailable")

const clipboardImageScript = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$image = [System.Windows.Forms.Clipboard]::GetImage()
if ($null -eq $image) { exit 0 }
try {
  $image.Save($env:GIT_MONOREPO_TOOLS_CLIPBOARD_IMAGE_PATH, [System.Drawing.Imaging.ImageFormat]::Png)
} finally {
  $image.Dispose()
}
`

func (Client) ReadClipboardImagePath() (string, error) {
	if !clipboardHasImage() {
		return "", nil
	}

	imageFile, err := os.CreateTemp("", "pi-clipboard-*.png")
	if err != nil {
		return "", fmt.Errorf("创建剪贴板图片临时文件失败: %w", err)
	}
	imagePath := imageFile.Name()
	if err := imageFile.Close(); err != nil {
		_ = os.Remove(imagePath)
		return "", fmt.Errorf("关闭剪贴板图片临时文件失败: %w", err)
	}
	if err := os.Remove(imagePath); err != nil {
		return "", fmt.Errorf("准备剪贴板图片临时文件失败: %w", err)
	}

	cmd := newClipboardImageCommand(imagePath)
	if output, err := cmd.CombinedOutput(); err != nil {
		_ = os.Remove(imagePath)
		return "", fmt.Errorf("读取剪贴板图片失败: %w: %s", err, output)
	}

	info, err := os.Stat(imagePath)
	if errors.Is(err, os.ErrNotExist) {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("检查剪贴板图片临时文件失败: %w", err)
	}
	if info.Size() == 0 {
		_ = os.Remove(imagePath)
		return "", errors.New("剪贴板图片为空")
	}
	return imagePath, nil
}

func clipboardHasImage() bool {
	return hasClipboardImage(func(format uint32) bool {
		available, _, _ := isClipboardFormatAvailable.Call(uintptr(format))
		return available != 0
	})
}

func hasClipboardImage(isFormatAvailable func(uint32) bool) bool {
	for _, format := range [...]uint32{clipboardFormatBitmap, clipboardFormatDIB, clipboardFormatDIBV5} {
		if isFormatAvailable(format) {
			return true
		}
	}
	return false
}

func newClipboardImageCommand(imagePath string) *exec.Cmd {
	cmd := exec.Command(
		"powershell.exe",
		"-NoProfile",
		"-NonInteractive",
		"-STA",
		"-Command",
		clipboardImageScript,
	)
	cmd.Env = append(os.Environ(), clipboardImagePathEnvironment+"="+imagePath)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	return cmd
}
