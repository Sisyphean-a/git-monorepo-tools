//go:build windows

package desktop

import (
	"runtime"
	"testing"
	"unsafe"
)

func TestReadClipboardMemoryDecodesLockedFormatData(t *testing.T) {
	for _, item := range []struct {
		name     string
		format   uint32
		codePage uint32
		data     []byte
		want     string
	}{
		{"unicode", clipboardFormatUnicodeText, 0, []byte{'A', 0, 0x60, 0x4f, 0x7d, 0x59, 0, 0, 'x', 0}, "A你好"},
		{"ansi", clipboardFormatText, windowsCodePageACP, []byte{'A', 0, 'x'}, "A"},
		{"oem", clipboardFormatOEMText, windowsCodePageOEM, []byte{'A', 0, 'x'}, "A"},
		{"empty unicode", clipboardFormatUnicodeText, 0, []byte{0, 0}, ""},
	} {
		t.Run(item.name, func(t *testing.T) {
			got, err := readClipboardMemory(uintptr(unsafe.Pointer(&item.data[0])), uintptr(len(item.data)), item.format, item.codePage)
			runtime.KeepAlive(item.data)
			if err != nil || got != item.want {
				t.Fatalf("memory decoding: got %q, err %v; want %q", got, err, item.want)
			}
		})
	}
}

func TestReadClipboardMemoryReportsInvalidAddress(t *testing.T) {
	if text, err := readClipboardMemory(0, 2, clipboardFormatUnicodeText, 0); err == nil || text != "" {
		t.Fatalf("unreadable memory must remain an error, got %q, %v", text, err)
	}
}
