//go:build windows

package desktop

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"syscall"
	"unsafe"
)

const (
	clipboardImagePathEnvironment = "GIT_MONOREPO_TOOLS_CLIPBOARD_IMAGE_PATH"
	clipboardFormatBitmap         = 2
	clipboardFormatDIB            = 8
	clipboardFormatDIBV5          = 17
)

var (
	isClipboardFormatAvailable = syscall.NewLazyDLL("user32.dll").NewProc("IsClipboardFormatAvailable")
	registerClipboardFormat    = syscall.NewLazyDLL("user32.dll").NewProc("RegisterClipboardFormatW")
)

var registeredClipboardImageFormatNames = [...]string{"PNG", "image/png"}

const clipboardImageScript = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

function Save-RegisteredClipboardImage($dataObject, $imagePath) {
  foreach ($format in @('PNG', 'image/png')) {
    if (-not $dataObject.GetDataPresent($format, $false)) { continue }
    $data = $dataObject.GetData($format, $false)
    $stream = $null
    try {
      if ($data -is [System.IO.Stream]) {
        $stream = $data
      } elseif ($data -is [byte[]]) {
        $stream = [System.IO.MemoryStream]::new($data, $false)
      } else {
        continue
      }
      $registeredImage = [System.Drawing.Image]::FromStream($stream)
      try {
        $registeredImage.Save($imagePath, [System.Drawing.Imaging.ImageFormat]::Png)
        return $true
      } finally {
        $registeredImage.Dispose()
      }
    } finally {
      if ($null -ne $stream) { $stream.Dispose() }
    }
  }
  return $false
}

$image = $null
for ($attempt = 0; $attempt -lt 6; $attempt++) {
  try {
    $image = [System.Windows.Forms.Clipboard]::GetImage()
    if ($null -ne $image) { break }
    $dataObject = [System.Windows.Forms.Clipboard]::GetDataObject()
    if ($null -ne $dataObject -and (Save-RegisteredClipboardImage $dataObject $env:GIT_MONOREPO_TOOLS_CLIPBOARD_IMAGE_PATH)) {
      exit 0
    }
  } catch {
    if ($attempt -eq 5) { throw }
  }
  Start-Sleep -Milliseconds 75
}
if ($null -eq $image) { throw 'Clipboard image data was unavailable after retries.' }
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

	if err := validateClipboardImageFile(imagePath); err != nil {
		_ = os.Remove(imagePath)
		return "", err
	}
	return imagePath, nil
}

func validateClipboardImageFile(imagePath string) error {
	info, err := os.Stat(imagePath)
	if errors.Is(err, os.ErrNotExist) {
		return errors.New("检测到剪贴板图片，但未能读取图片数据")
	}
	if err != nil {
		return fmt.Errorf("检查剪贴板图片临时文件失败: %w", err)
	}
	if info.Size() == 0 {
		return errors.New("剪贴板图片为空")
	}
	return nil
}

func clipboardHasImage() bool {
	formats := clipboardImageFormats(registerClipboardImageFormat)
	return hasClipboardImage(formats, func(format uint32) bool {
		available, _, _ := isClipboardFormatAvailable.Call(uintptr(format))
		return available != 0
	})
}

func clipboardImageFormats(registerFormat func(string) uint32) []uint32 {
	formats := []uint32{clipboardFormatBitmap, clipboardFormatDIB, clipboardFormatDIBV5}
	for _, name := range registeredClipboardImageFormatNames {
		if format := registerFormat(name); format != 0 {
			formats = append(formats, format)
		}
	}
	return formats
}

func registerClipboardImageFormat(name string) uint32 {
	value, err := syscall.UTF16PtrFromString(name)
	if err != nil {
		return 0
	}
	format, _, _ := registerClipboardFormat.Call(uintptr(unsafe.Pointer(value)))
	return uint32(format)
}

func hasClipboardImage(formats []uint32, isFormatAvailable func(uint32) bool) bool {
	for _, format := range formats {
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
