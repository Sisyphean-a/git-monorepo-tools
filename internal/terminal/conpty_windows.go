//go:build windows

package terminal

import (
	"crypto/sha256"
	"embed"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

// conptyAssetsVersion 是随包分发的 Windows Terminal ConPTY 构建版本，同时用作解包目录身份。
const conptyAssetsVersion = "1.23.251008001"

//go:embed conptyassets
var conptyAssetFiles embed.FS

// conptyAssetArchitectures 把 Go 架构映射到随包目录；未列出的架构在创建终端时显式失败。
var conptyAssetArchitectures = map[string]string{
	"amd64": "win10-x64",
	"arm64": "win10-arm64",
}

// conptyAssetFilesNames 是运行期必需的两个文件：conpty.dll 提供现代实现，OpenConsole.exe
// 是它的控制台宿主，两者必须位于同一目录。
var conptyAssetFileNames = []string{"conpty.dll", "OpenConsole.exe"}

// pseudoConsoleApi 收拢随包 conpty.dll 的一套原生操作，保证创建、resize、release 与关闭
// 使用同一实现，不会跨实现混用 HPCON 句柄。
type pseudoConsoleApi struct {
	create  func(size windows.Coord, input, output windows.Handle, flags uint32, pconsole *windows.Handle) error
	resize  func(pconsole windows.Handle, size windows.Coord) error
	release func(pconsole windows.Handle)
	close   func(pconsole windows.Handle) error
}

var (
	pseudoConsoleApiOnce  sync.Once
	pseudoConsoleApiValue pseudoConsoleApi
	pseudoConsoleApiErr   error

	updateProcThreadAttributeProc = windows.NewLazySystemDLL("kernel32.dll").NewProc("UpdateProcThreadAttribute")
)

// windowsPty 是本仓库自己的 Windows 伪控制台宿主。
//
// Rule: 必须使用随包分发的现代 conpty.dll，不提供 inbox 降级。Windows 10 的 inbox
// CreatePseudoConsole 会启动 conhost.exe --headless，它在输出侧吞掉 DEC 鼠标模式
// （1000h/1002h/1003h/1006h），在输入侧吞掉 SGR 鼠标上报，使内嵌终端里的 pi 全屏滚轮完全
// 失效；静默回退会把该缺陷重新带回来，且只留下一行用户看不到的日志，因此加载失败必须显式失败。
// 管道、spawn、resize、关闭都在同一来源上完成，避免跨实现混用 HPCON 句柄。
type windowsPty struct {
	api           pseudoConsoleApi
	hpc           *windows.Handle
	inRead        windows.Handle
	inWrite       windows.Handle
	outRead       windows.Handle
	outWrite      windows.Handle
	attributeList *windows.ProcThreadAttributeListContainer
	closeOnce     sync.Once
	closeErr      error
}

// resolvePseudoConsoleApi 只在首次调用时加载实现，失败原因保留给每个终端显式报错。
func resolvePseudoConsoleApi() (pseudoConsoleApi, error) {
	pseudoConsoleApiOnce.Do(func() {
		pseudoConsoleApiValue, pseudoConsoleApiErr = loadConptyDllApi()
	})
	return pseudoConsoleApiValue, pseudoConsoleApiErr
}

func loadConptyDllApi() (pseudoConsoleApi, error) {
	architecture, supported := conptyAssetArchitectures[runtime.GOARCH]
	if !supported {
		return pseudoConsoleApi{}, fmt.Errorf("未随包分发 %s 架构的 ConPTY", runtime.GOARCH)
	}
	directory, err := extractConptyAssets(architecture)
	if err != nil {
		return pseudoConsoleApi{}, err
	}

	// LoadLibraryEx 以 DLL 所在目录解析它自己依赖的 OpenConsole.exe。
	module, err := windows.LoadLibraryEx(
		filepath.Join(directory, "conpty.dll"),
		0,
		windows.LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR|windows.LOAD_LIBRARY_SEARCH_DEFAULT_DIRS,
	)
	if err != nil {
		return pseudoConsoleApi{}, fmt.Errorf("加载 conpty.dll 失败: %w", err)
	}

	create, err := conptyDllExport(module, "ConptyCreatePseudoConsole")
	if err != nil {
		return pseudoConsoleApi{}, err
	}
	resize, err := conptyDllExport(module, "ConptyResizePseudoConsole")
	if err != nil {
		return pseudoConsoleApi{}, err
	}
	release, err := conptyDllExport(module, "ConptyReleasePseudoConsole")
	if err != nil {
		return pseudoConsoleApi{}, err
	}
	closePseudoConsole, err := conptyDllExport(module, "ConptyClosePseudoConsole")
	if err != nil {
		return pseudoConsoleApi{}, err
	}

	return pseudoConsoleApi{
		create: func(size windows.Coord, input, output windows.Handle, flags uint32, pconsole *windows.Handle) error {
			result, _, _ := syscall.SyscallN(create,
				uintptr(packedCoord(size)),
				uintptr(input),
				uintptr(output),
				uintptr(flags),
				uintptr(unsafe.Pointer(pconsole)),
			)
			return hresultError("ConptyCreatePseudoConsole", result)
		},
		resize: func(pconsole windows.Handle, size windows.Coord) error {
			result, _, _ := syscall.SyscallN(resize, uintptr(pconsole), uintptr(packedCoord(size)))
			return hresultError("ConptyResizePseudoConsole", result)
		},
		release: func(pconsole windows.Handle) {
			_, _, _ = syscall.SyscallN(release, uintptr(pconsole))
		},
		close: func(pconsole windows.Handle) error {
			_, _, _ = syscall.SyscallN(closePseudoConsole, uintptr(pconsole))
			return nil
		},
	}, nil
}

func conptyDllExport(module windows.Handle, name string) (uintptr, error) {
	address, err := windows.GetProcAddress(module, name)
	if err != nil {
		return 0, fmt.Errorf("conpty.dll 缺少导出 %s: %w", name, err)
	}
	return address, nil
}

// packedCoord 按 Windows ABI 把 COORD 作为 4 字节按值参数打包（X 低 16 位、Y 高 16 位）。
func packedCoord(size windows.Coord) uint32 {
	return uint32(uint16(size.X)) | uint32(uint16(size.Y))<<16
}

func hresultError(operation string, result uintptr) error {
	if result == 0 {
		return nil
	}
	return fmt.Errorf("%s 失败: HRESULT 0x%08X", operation, uint32(result))
}

// extractConptyAssets 把随包二进制解到用户缓存目录，供 LoadLibraryEx 从磁盘加载。
//
// Guarantee: 已存在且内容哈希一致的文件不重写，重复创建终端不产生额外磁盘写入。
func extractConptyAssets(architecture string) (string, error) {
	cacheRoot, err := os.UserCacheDir()
	if err != nil {
		return "", fmt.Errorf("定位用户缓存目录失败: %w", err)
	}
	directory := filepath.Join(cacheRoot, "git-monorepo-tools", "conpty", conptyAssetsVersion, architecture)
	if err := os.MkdirAll(directory, 0o755); err != nil {
		return "", fmt.Errorf("创建 ConPTY 解包目录失败: %w", err)
	}

	for _, name := range conptyAssetFileNames {
		content, err := conptyAssetFiles.ReadFile("conptyassets/" + architecture + "/" + name)
		if err != nil {
			return "", fmt.Errorf("读取随包 %s 失败: %w", name, err)
		}
		target := filepath.Join(directory, name)
		if matchesConptyAsset(target, content) {
			continue
		}
		// Guarantee: 先写临时文件再重命名，并发创建终端时不会加载到只写了一半的二进制；
		// 写完必须再校验一次，不能把不可用的文件留给下一个进程。
		temporary := fmt.Sprintf("%s.tmp-%d", target, os.Getpid())
		if err := os.WriteFile(temporary, content, 0o644); err != nil {
			return "", fmt.Errorf("写出 %s 失败: %w", temporary, err)
		}
		if err := os.Rename(temporary, target); err != nil {
			_ = os.Remove(temporary)
			return "", fmt.Errorf("替换 %s 失败: %w", target, err)
		}
		if !matchesConptyAsset(target, content) {
			return "", fmt.Errorf("%s 写入后校验失败", target)
		}
	}
	return directory, nil
}

// matchesConptyAsset 用内容哈希而非文件长度判断缓存是否可用，避免复用等长损坏文件。
func matchesConptyAsset(path string, content []byte) bool {
	existing, err := os.ReadFile(path)
	if err != nil {
		return false
	}
	return sha256.Sum256(existing) == sha256.Sum256(content)
}

func newWindowsPty(cols, rows int) (*windowsPty, error) {
	api, err := resolvePseudoConsoleApi()
	if err != nil {
		return nil, err
	}
	inRead, inWrite, pipeErr := createPtyPipe()
	if pipeErr != nil {
		return nil, pipeErr
	}
	outRead, outWrite, pipeErr := createPtyPipe()
	if pipeErr != nil {
		_ = closeHandle(inRead)
		_ = closeHandle(inWrite)
		return nil, pipeErr
	}

	pty := &windowsPty{
		api:      api,
		hpc:      new(windows.Handle),
		inRead:   inRead,
		inWrite:  inWrite,
		outRead:  outRead,
		outWrite: outWrite,
	}
	if err := api.create(windows.Coord{X: int16(cols), Y: int16(rows)}, inRead, outWrite, 0, pty.hpc); err != nil {
		_ = pty.closeHandles()
		return nil, fmt.Errorf("创建伪控制台失败: %w", err)
	}

	attributeList, err := windows.NewProcThreadAttributeList(1)
	if err != nil {
		_ = pty.Close()
		return nil, fmt.Errorf("创建伪控制台属性列表失败: %w", err)
	}
	// Rule: 该属性按官方样例直接取 HPCON 值本身，而不是它的地址。
	if err := applyPseudoConsoleAttribute(attributeList, *pty.hpc); err != nil {
		attributeList.Delete()
		_ = pty.Close()
		return nil, err
	}
	pty.attributeList = attributeList
	return pty, nil
}

// spawn 让子进程挂到伪控制台上，返回进程句柄；调用方负责终止与关闭句柄。
func (p *windowsPty) spawn(executable string, argv []string, workingDir string, environ []string) (windows.Handle, error) {
	application, err := windows.UTF16PtrFromString(executable)
	if err != nil {
		return 0, err
	}
	commandLine, err := windows.UTF16PtrFromString(windows.ComposeCommandLine(argv))
	if err != nil {
		return 0, err
	}
	environment, err := makeEnvironmentBlock(environ)
	if err != nil {
		return 0, err
	}
	var directory *uint16
	if workingDir != "" {
		if directory, err = windows.UTF16PtrFromString(workingDir); err != nil {
			return 0, err
		}
	}

	startupInfo := new(windows.StartupInfoEx)
	startupInfo.Flags = windows.STARTF_USESTDHANDLES
	startupInfo.ProcThreadAttributeList = p.attributeList.List()
	startupInfo.Cb = uint32(unsafe.Sizeof(*startupInfo))
	security := &windows.SecurityAttributes{
		Length:        uint32(unsafe.Sizeof(windows.SecurityAttributes{})),
		InheritHandle: 1,
	}
	processInfo := new(windows.ProcessInformation)

	if err := windows.CreateProcess(
		application,
		commandLine,
		security,
		security,
		false,
		windows.CREATE_UNICODE_ENVIRONMENT|windows.EXTENDED_STARTUPINFO_PRESENT,
		environment,
		directory,
		&startupInfo.StartupInfo,
		processInfo,
	); err != nil {
		return 0, err
	}
	_ = windows.CloseHandle(processInfo.Thread)

	// Effect: 现代实现要求父进程在子进程启动后释放伪控制台引用；inbox 实现没有对应导出。
	if p.api.release != nil {
		p.api.release(*p.hpc)
	}
	return processInfo.Process, nil
}

func (p *windowsPty) Read(buffer []byte) (int, error) {
	var read uint32
	err := windows.ReadFile(p.outRead, buffer, &read, nil)
	return int(read), err
}

func (p *windowsPty) Write(data []byte) (int, error) {
	var written uint32
	err := windows.WriteFile(p.inWrite, data, &written, nil)
	return int(written), err
}

func (p *windowsPty) Resize(cols, rows int) error {
	if err := p.api.resize(*p.hpc, windows.Coord{X: int16(cols), Y: int16(rows)}); err != nil {
		return fmt.Errorf("调整伪控制台尺寸失败: %w", err)
	}
	return nil
}

func (p *windowsPty) Close() error {
	p.closeOnce.Do(func() {
		if p.attributeList != nil {
			p.attributeList.Delete()
			p.attributeList = nil
		}
		p.closeErr = errors.Join(
			closeHandle(p.inRead),
			closeHandle(p.outWrite),
			p.api.close(*p.hpc),
			closeHandle(p.inWrite),
			closeHandle(p.outRead),
		)
	})
	return p.closeErr
}

func (p *windowsPty) closeHandles() error {
	return errors.Join(closeHandle(p.inRead), closeHandle(p.inWrite), closeHandle(p.outRead), closeHandle(p.outWrite))
}

// applyPseudoConsoleAttribute 把伪控制台句柄写进 CreateProcess 属性列表。
//
// Rule: PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE 的 lpValue 是 HPCON 值本身（官方样例如此传入），
// 所以句柄按 uintptr 交给原始 API，不能做 uintptr→unsafe.Pointer 转换。
func applyPseudoConsoleAttribute(attributeList *windows.ProcThreadAttributeListContainer, pseudoConsole windows.Handle) error {
	result, _, callErr := updateProcThreadAttributeProc.Call(
		uintptr(unsafe.Pointer(attributeList.List())),
		0,
		windows.PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE,
		uintptr(pseudoConsole),
		unsafe.Sizeof(pseudoConsole),
		0,
		0,
	)
	if result == 0 {
		return fmt.Errorf("写入伪控制台属性失败: %w", callErr)
	}
	return nil
}

func createPtyPipe() (read windows.Handle, write windows.Handle, err error) {
	security := &windows.SecurityAttributes{
		Length:        uint32(unsafe.Sizeof(windows.SecurityAttributes{})),
		InheritHandle: 1,
	}
	if err := windows.CreatePipe(&read, &write, security, 0); err != nil {
		return 0, 0, fmt.Errorf("创建终端管道失败: %w", err)
	}
	return read, write, nil
}

// makeEnvironmentBlock 生成 CreateProcess 需要的 UTF-16 环境块。
//
// Rule: 与替换前的实现保持一致的契约——大小写不敏感去重、保留最后一次出现的值、首字符为 '='
// 的系统项原样保留，并保证 SYSTEMROOT 存在。
func makeEnvironmentBlock(environ []string) (*uint16, error) {
	entries := dedupeWindowsEnvironment(environ)
	if !hasWindowsEnvironmentVariable(entries, "SYSTEMROOT") {
		entries = append(entries, "SYSTEMROOT="+os.Getenv("SYSTEMROOT"))
	}

	units := make([]uint16, 0, len(entries)*8)
	for _, entry := range entries {
		encoded, err := windows.UTF16FromString(entry)
		if err != nil {
			return nil, fmt.Errorf("终端环境变量无法编码: %w", err)
		}
		units = append(units, encoded...)
	}
	units = append(units, 0)
	return &units[0], nil
}

func dedupeWindowsEnvironment(environ []string) []string {
	result := make([]string, 0, len(environ))
	positions := make(map[string]int, len(environ))
	for _, entry := range environ {
		name, _, found := strings.Cut(entry, "=")
		if !found || name == "" {
			result = append(result, entry)
			continue
		}
		key := strings.ToUpper(name)
		if index, exists := positions[key]; exists {
			result[index] = entry
			continue
		}
		positions[key] = len(result)
		result = append(result, entry)
	}
	return result
}

func hasWindowsEnvironmentVariable(environ []string, name string) bool {
	for _, entry := range environ {
		key, _, found := strings.Cut(entry, "=")
		if found && strings.EqualFold(key, name) {
			return true
		}
	}
	return false
}
