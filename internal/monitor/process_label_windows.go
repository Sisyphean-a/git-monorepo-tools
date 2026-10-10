package monitor

import (
	"errors"
	"fmt"
	"strings"
	"unsafe"

	"golang.org/x/sys/windows"
)

const processCommandLineInformation = 60

type processUnicodeString struct {
	Length, MaximumLength uint16
	Buffer                *uint16
}

func processLabel(handle windows.Handle, name string) (string, string) {
	if strings.EqualFold(name, "gopls.exe") {
		return "Go 语言服务", ""
	}
	if !strings.EqualFold(name, "node.exe") && !strings.EqualFold(name, "bun.exe") {
		return "", ""
	}
	commandLine, err := readProcessCommandLine(handle)
	if err != nil {
		return "", "进程用途读取失败：" + err.Error()
	}
	args, err := windows.DecomposeCommandLine(commandLine)
	if err != nil {
		return "", "进程启动参数无法解析"
	}
	// Guarantee: 原始命令行只在本次查询中用于识别入口脚本，DTO、历史、日志与界面均只保留固定用途标签，防止参数中的密钥泄露。
	return runtimeProcessLabel(args), ""
}

func runtimeProcessLabel(args []string) string {
	if len(args) < 2 {
		return ""
	}
	runtimeName := strings.ToLower(strings.ReplaceAll(args[0], `\`, "/"))
	entry := 1
	if args[entry] == "run" && (runtimeName == "bun.exe" || strings.HasSuffix(runtimeName, "/bun.exe")) {
		entry++
	}
	if entry < len(args) && args[entry] == "--" {
		entry++
	}
	// Rule: 带运行时选项时无法可靠判断参数值与入口的边界，不猜测；只识别明确的第一个入口，绝不扫描后续业务参数。
	if entry >= len(args) || strings.HasPrefix(args[entry], "-") {
		return ""
	}
	script := strings.ToLower(strings.ReplaceAll(args[entry], `\`, "/"))
	switch {
	case strings.HasSuffix(script, "/pi-coding-agent/dist/bundle/cli.js"):
		return "Pi"
	case strings.Contains(script, "/node_modules/context-mode/"):
		return "context-mode"
	case strings.Contains(script, "/node_modules/@colbymchenry/codegraph/"):
		return "Codegraph"
	case strings.HasSuffix(script, "/typescript/lib/tsserver.js"), strings.HasSuffix(script, "/typescript/lib/typingsinstaller.js"), strings.Contains(script, "/node_modules/typescript-language-server/"):
		return "TypeScript 语言服务"
	}
	return ""
}

func readProcessCommandLine(handle windows.Handle) (string, error) {
	buffer := make([]byte, unsafe.Sizeof(processUnicodeString{}))
	for {
		var needed uint32
		err := windows.NtQueryInformationProcess(handle, processCommandLineInformation, unsafe.Pointer(&buffer[0]), uint32(len(buffer)), &needed)
		if errors.Is(err, windows.STATUS_INFO_LENGTH_MISMATCH) || errors.Is(err, windows.STATUS_BUFFER_TOO_SMALL) {
			size := max(uint64(needed), uint64(len(buffer))*2)
			if size > uint64(^uint32(0)) || size > uint64(^uint(0)>>1) {
				return "", errors.New("进程命令行超过 API 可表示长度")
			}
			buffer = make([]byte, int(size))
			continue
		}
		if err != nil {
			return "", fmt.Errorf("NtQueryInformationProcess：%w", err)
		}
		if needed > uint32(len(buffer)) || needed < uint32(unsafe.Sizeof(processUnicodeString{})) {
			return "", errors.New("进程命令行返回长度无效")
		}
		value := *(*processUnicodeString)(unsafe.Pointer(&buffer[0]))
		if value.Length == 0 {
			return "", nil
		}
		start, end := uintptr(unsafe.Pointer(&buffer[0])), uintptr(unsafe.Pointer(&buffer[0]))+uintptr(needed)
		address := uintptr(unsafe.Pointer(value.Buffer))
		if value.Length%2 != 0 || value.Length > value.MaximumLength || address < start+unsafe.Sizeof(value) || address > end || uintptr(value.Length) > end-address {
			return "", errors.New("进程命令行字符串范围无效")
		}
		return windows.UTF16ToString(unsafe.Slice(value.Buffer, int(value.Length)/2)), nil
	}
}
