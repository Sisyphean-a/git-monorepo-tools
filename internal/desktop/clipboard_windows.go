//go:build windows

package desktop

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"syscall"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

const (
	clipboardImagePathEnvironment = "GIT_MONOREPO_TOOLS_CLIPBOARD_IMAGE_PATH"
	clipboardNoImageExitCode      = 3
	clipboardFormatText           = 1
	clipboardFormatOEMText        = 7
	clipboardFormatUnicodeText    = 13
	windowsCodePageACP            = 0
	windowsCodePageOEM            = 1
)

var (
	isClipboardFormatAvailable = syscall.NewLazyDLL("user32.dll").NewProc("IsClipboardFormatAvailable")
	openClipboard              = syscall.NewLazyDLL("user32.dll").NewProc("OpenClipboard")
	closeClipboard             = syscall.NewLazyDLL("user32.dll").NewProc("CloseClipboard")
	getClipboardData           = syscall.NewLazyDLL("user32.dll").NewProc("GetClipboardData")
	enumClipboardFormats       = syscall.NewLazyDLL("user32.dll").NewProc("EnumClipboardFormats")
	globalLock                 = syscall.NewLazyDLL("kernel32.dll").NewProc("GlobalLock")
	globalUnlock               = syscall.NewLazyDLL("kernel32.dll").NewProc("GlobalUnlock")
	globalSize                 = syscall.NewLazyDLL("kernel32.dll").NewProc("GlobalSize")
)

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
if ($null -eq $image) { exit 3 }
try {
  $image.Save($env:GIT_MONOREPO_TOOLS_CLIPBOARD_IMAGE_PATH, [System.Drawing.Imaging.ImageFormat]::Png)
} finally {
  $image.Dispose()
}
`

func (Client) ReadClipboardImagePath() (string, error) {
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
		var exitError *exec.ExitError
		if errors.As(err, &exitError) && exitError.ExitCode() == clipboardNoImageExitCode {
			return "", nil
		}
		return "", fmt.Errorf("读取剪贴板图片失败: %w: %s", err, output)
	}

	if err := validateClipboardImageFile(imagePath); err != nil {
		_ = os.Remove(imagePath)
		return "", err
	}
	return imagePath, nil
}

func (Client) ReadClipboardText() (string, error) {
	// Guarantee: 打开、读取和关闭剪贴板固定在同一 OS 线程，保持 Win32 的线程归属约束。
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()

	var openErr error
	for attempt := 0; attempt < 20; attempt++ {
		opened, _, err := openClipboard.Call(0)
		if opened != 0 {
			defer closeClipboard.Call()
			return readOpenClipboardText()
		}
		openErr = err
		time.Sleep(50 * time.Millisecond)
	}
	return "", fmt.Errorf("打开 Windows 剪贴板失败: %w", openErr)
}

func readOpenClipboardText() (string, error) {
	for _, candidate := range []struct {
		format   uint32
		codePage uint32
	}{
		{format: clipboardFormatUnicodeText},
		{format: clipboardFormatText, codePage: windowsCodePageACP},
		{format: clipboardFormatOEMText, codePage: windowsCodePageOEM},
	} {
		available, _, _ := isClipboardFormatAvailable.Call(uintptr(candidate.format))
		if available == 0 {
			continue
		}
		return readOpenClipboardFormat(candidate.format, candidate.codePage)
	}
	return "", nil
}

func readOpenClipboardFormat(format uint32, codePage uint32) (string, error) {
	handle, _, err := getClipboardData.Call(uintptr(format))
	if handle == 0 {
		return "", fmt.Errorf("读取 Windows 剪贴板格式 %d 句柄失败: %w", format, err)
	}
	size, _, err := globalSize.Call(handle)
	if size == 0 {
		return "", fmt.Errorf("读取 Windows 剪贴板格式 %d 长度失败: %w", format, err)
	}
	pointer, _, err := globalLock.Call(handle)
	if pointer == 0 {
		return "", fmt.Errorf("锁定 Windows 剪贴板格式 %d 失败: %w", format, err)
	}
	defer globalUnlock.Call(handle)

	return readClipboardMemory(pointer, size, format, codePage)
}

func readClipboardMemory(address, size uintptr, format, codePage uint32) (string, error) {
	if size > uintptr(^uint(0)>>1) {
		return "", errors.New("剪贴板数据超过 Go 缓冲区可表示长度")
	}
	var units []uint16
	var bytes []byte
	var buffer *byte
	if format == clipboardFormatUnicodeText {
		units = make([]uint16, int(size)/2)
		if len(units) == 0 {
			return "", nil
		}
		size = uintptr(len(units)) * 2
		buffer = (*byte)(unsafe.Pointer(&units[0]))
	} else {
		bytes = make([]byte, int(size))
		if len(bytes) == 0 {
			return "", nil
		}
		buffer = &bytes[0]
	}
	// Guarantee: 在 GlobalLock 的有效期内由 Win32 复制到 Go 缓冲区，不将原生整数地址转为 Go 指针；复制失败或不完整都显式报错。
	var copied uintptr
	if err := windows.ReadProcessMemory(windows.CurrentProcess(), address, buffer, size, &copied); err != nil {
		return "", fmt.Errorf("复制 Windows 剪贴板格式 %d 数据失败: %w", format, err)
	}
	if copied != size {
		return "", fmt.Errorf("复制 Windows 剪贴板格式 %d 数据不完整: %d/%d", format, copied, size)
	}
	if format == clipboardFormatUnicodeText {
		return decodeClipboardUTF16(units), nil
	}
	return decodeClipboardBytes(bytes, codePage)
}

func listOpenClipboardFormats() []uint32 {
	formats := make([]uint32, 0, 8)
	var current uintptr
	for {
		next, _, _ := enumClipboardFormats.Call(current)
		if next == 0 {
			return formats
		}
		formats = append(formats, uint32(next))
		current = next
	}
}

func decodeClipboardUTF16(units []uint16) string {
	for index, unit := range units {
		if unit == 0 {
			units = units[:index]
			break
		}
	}
	return syscall.UTF16ToString(units)
}

func decodeClipboardBytes(value []byte, codePage uint32) (string, error) {
	for index, current := range value {
		if current == 0 {
			value = value[:index]
			break
		}
	}
	if len(value) == 0 {
		return "", nil
	}
	length, err := windows.MultiByteToWideChar(codePage, 0, &value[0], int32(len(value)), nil, 0)
	if err != nil {
		return "", fmt.Errorf("计算 Windows 剪贴板文本转换长度失败: %w", err)
	}
	converted := make([]uint16, length)
	if _, err := windows.MultiByteToWideChar(codePage, 0, &value[0], int32(len(value)), &converted[0], length); err != nil {
		return "", fmt.Errorf("转换 Windows 剪贴板文本失败: %w", err)
	}
	return syscall.UTF16ToString(converted), nil
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
