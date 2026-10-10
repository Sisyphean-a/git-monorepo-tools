package monitor

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"unsafe"

	"golang.org/x/sys/windows"
)

var (
	psapi          = windows.NewLazySystemDLL("psapi.dll")
	kernel         = windows.NewLazySystemDLL("kernel32.dll")
	getMemory      = psapi.NewProc("GetProcessMemoryInfo")
	getPerformance = psapi.NewProc("GetPerformanceInfo")
	getHandleCount = kernel.NewProc("GetProcessHandleCount")
	getTickCount   = kernel.NewProc("GetTickCount64")
	querySystem    = windows.NewLazySystemDLL("ntdll.dll").NewProc("NtQuerySystemInformation")
)

type processMemory struct {
	Size, PageFaults                                                  uint32
	PeakWorkingSet, WorkingSet, PeakPagedQuota, PagedQuota            uintptr
	PeakNonpagedQuota, NonpagedQuota, Pagefile, PeakPagefile, Private uintptr
}

type performanceInfo struct {
	Size                                                                   uint32
	CommitTotal, CommitLimit, CommitPeak, PhysicalTotal, PhysicalAvailable uintptr
	SystemCache, KernelTotal, KernelPaged, KernelNonpaged, PageSize        uintptr
	Handles, Processes, Threads                                            uint32
}

// Flow: 主进程与系统计数直接读取；只有 includeProcesses 为真时才枚举进程表并构建进程树。
func readPlatformSnapshot(includeProcesses bool, terminals []TerminalScope) (Snapshot, error) {
	root := uint32(os.Getpid())
	main, err := readProcess(processIdentity{pid: root, name: executableName()})
	if err != nil {
		return Snapshot{}, fmt.Errorf("读取主进程资源失败：%w", err)
	}
	var info performanceInfo
	info.Size = uint32(unsafe.Sizeof(info))
	ok, _, callErr := getPerformance.Call(uintptr(unsafe.Pointer(&info)), uintptr(info.Size))
	if ok == 0 {
		return Snapshot{}, fmt.Errorf("读取系统内存失败：%w", callErr)
	}
	tickLow, tickHigh, _ := getTickCount.Call()
	elapsed := uint64(tickLow)
	if unsafe.Sizeof(uintptr(0)) == 4 {
		elapsed |= uint64(tickHigh) << 32
	}
	result := Snapshot{
		Main: main, ElapsedMillis: elapsed,
		System: SystemMemory{
			TotalBytes:        uint64(info.PhysicalTotal) * uint64(info.PageSize),
			AvailableBytes:    uint64(info.PhysicalAvailable) * uint64(info.PageSize),
			PagedPoolBytes:    uint64(info.KernelPaged) * uint64(info.PageSize),
			NonpagedPoolBytes: uint64(info.KernelNonpaged) * uint64(info.PageSize),
		},
	}
	result.System.FilePool, err = readFilePool()
	if err != nil {
		// Failure: File 查询有独立错误和未知值，不能把失败伪装成零，也不抹掉已成功读取的进程与系统总量。
		result.System.FilePoolError = err.Error()
	}
	// Guarantee: 未枚举进程树时 children 保持 null（未采集），不能和“确实没有子进程”的 [] 混淆。
	if !includeProcesses {
		return result, nil
	}
	result.Children = []Process{}
	rows, err := processEntries()
	if err != nil {
		return Snapshot{}, err
	}
	byParent := map[uint32][]uint32{}
	for pid, entry := range rows {
		byParent[entry.ParentProcessID] = append(byParent[entry.ParentProcessID], pid)
	}
	queue := []Process{main}
	seen := map[uint32]bool{root: true}
	for len(queue) > 0 {
		parent := queue[0]
		queue = queue[1:]
		for _, pid := range byParent[parent.PID] {
			if seen[pid] {
				continue
			}
			seen[pid] = true
			entry := rows[pid]
			child, readErr := readProcess(processIdentity{pid: pid, parentPid: parent.PID, name: windows.UTF16ToString(entry.ExeFile[:])})
			if errors.Is(readErr, windows.ERROR_INVALID_PARAMETER) || errors.Is(readErr, windows.ERROR_NOT_FOUND) {
				continue
			}
			if readErr != nil {
				child = Process{PID: pid, ParentPID: parent.PID, Name: windows.UTF16ToString(entry.ExeFile[:]), Error: readErr.Error()}
			}
			// Rule: 旧父进程退出后的 PID 复用不能把更早创建的进程算作当前子进程。
			if child.CreatedAt != 0 && child.CreatedAt < parent.CreatedAt {
				continue
			}
			result.Children = append(result.Children, child)
			queue = append(queue, child)
		}
	}
	// Flow: Job 归属可以保留中间父进程已退出的存活成员；只补充身份仍匹配的成员，不能把被复用的 PID 纳入快照。
	for index := range terminals {
		scope := &terminals[index]
		for _, identity := range scope.Members {
			if seen[identity.PID] || identity.PID == root {
				continue
			}
			entry, found := rows[identity.PID]
			if !found {
				continue
			}
			process, readErr := readProcess(processIdentity{pid: identity.PID, parentPid: entry.ParentProcessID, name: windows.UTF16ToString(entry.ExeFile[:])})
			if readErr != nil {
				if !errors.Is(readErr, windows.ERROR_INVALID_PARAMETER) && !errors.Is(readErr, windows.ERROR_NOT_FOUND) {
					if scope.Error != "" {
						scope.Error += "；"
					}
					scope.Error += fmt.Sprintf("成员 PID %d 资源读取失败：%v", identity.PID, readErr)
				}
				continue
			}
			if process.CreatedAt != identity.CreatedAt {
				continue
			}
			seen[identity.PID] = true
			result.Children = append(result.Children, process)
		}
	}
	sort.Slice(result.Children, func(i, j int) bool { return result.Children[i].PID < result.Children[j].PID })
	return result, nil
}

// Effect: 取自身可执行文件名，避免为轻量采样枚举整张进程表。
func executableName() string {
	path, err := os.Executable()
	if err != nil {
		return ""
	}
	return filepath.Base(path)
}

func processEntries() (map[uint32]windows.ProcessEntry32, error) {
	handle, err := windows.CreateToolhelp32Snapshot(windows.TH32CS_SNAPPROCESS, 0)
	if err != nil {
		return nil, err
	}
	defer windows.CloseHandle(handle)
	entry := windows.ProcessEntry32{Size: uint32(unsafe.Sizeof(windows.ProcessEntry32{}))}
	if err := windows.Process32First(handle, &entry); err != nil {
		return nil, err
	}
	rows := map[uint32]windows.ProcessEntry32{}
	for {
		rows[entry.ProcessID] = entry
		err := windows.Process32Next(handle, &entry)
		if errors.Is(err, windows.ERROR_NO_MORE_FILES) {
			return rows, nil
		}
		if err != nil {
			return nil, err
		}
	}
}

const systemPoolTagInformation = 22

type poolTag struct {
	Tag                           [4]byte
	PagedAllocs, PagedFrees       uint32
	PagedUsed                     uintptr
	NonpagedAllocs, NonpagedFrees uint32
	NonpagedUsed                  uintptr
}

type poolTagInformation struct {
	Count uint32
	First poolTag
}

func readFilePool() (*FilePool, error) {
	if err := querySystem.Find(); err != nil {
		return nil, fmt.Errorf("NtQuerySystemInformation 不可用：%w", err)
	}
	buffer := make([]byte, unsafe.Sizeof(poolTagInformation{}))
	for {
		var needed uint32
		status, _, _ := querySystem.Call(systemPoolTagInformation, uintptr(unsafe.Pointer(&buffer[0])), uintptr(len(buffer)), uintptr(unsafe.Pointer(&needed)))
		code := uint32(status)
		if code == 0xc0000004 || code == 0xc0000023 {
			// Flow: 系统标签表可在查询间增长，按返回长度或扩容后的长度重试，只受 Native API 的 ULONG 长度与地址空间约束。
			size := max(uint64(needed), uint64(len(buffer))*2)
			if size > uint64(^uint32(0)) || size > uint64(^uint(0)>>1) {
				return nil, fmt.Errorf("池标签表超过 Native API 可表示长度：%d", size)
			}
			buffer = make([]byte, int(size))
			continue
		}
		if int32(code) < 0 {
			return nil, fmt.Errorf("NtQuerySystemInformation：NTSTATUS 0x%08X", code)
		}
		if needed > uint32(len(buffer)) {
			return nil, fmt.Errorf("池标签返回长度无效：%d", needed)
		}
		return parseFilePool(buffer[:needed])
	}
}

func parseFilePool(buffer []byte) (*FilePool, error) {
	offset, stride := int(unsafe.Offsetof(poolTagInformation{}.First)), int(unsafe.Sizeof(poolTag{}))
	if len(buffer) < offset {
		return nil, errors.New("池标签返回头部不完整")
	}
	count := uint64(*(*uint32)(unsafe.Pointer(&buffer[0])))
	if count > uint64((len(buffer)-offset)/stride) {
		return nil, errors.New("池标签返回条目不完整")
	}
	for index := 0; index < int(count); index++ {
		entry := *(*poolTag)(unsafe.Pointer(&buffer[offset+index*stride]))
		if entry.Tag != [4]byte{'F', 'i', 'l', 'e'} {
			continue
		}
		// Rule: 旧版池标签累计分配/释放计数为 ULONG，先按 uint32 模运算求差，避免开机累计计数回绕造成虚假巨量增长。
		return &FilePool{
			Count: uint64(entry.PagedAllocs-entry.PagedFrees) + uint64(entry.NonpagedAllocs-entry.NonpagedFrees),
			Bytes: uint64(entry.PagedUsed) + uint64(entry.NonpagedUsed),
		}, nil
	}
	return nil, errors.New("系统未返回 File 池标签")
}

type processIdentity struct {
	pid       uint32
	parentPid uint32
	name      string
}

func readProcess(identity processIdentity) (Process, error) {
	// Rule: 当前进程使用伪句柄，避免把采样器自身临时句柄算入读数。
	handle := windows.Handle(^uintptr(0))
	if identity.pid != uint32(os.Getpid()) {
		var err error
		handle, err = windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION, false, identity.pid)
		if err != nil {
			return Process{}, err
		}
		defer windows.CloseHandle(handle)
	}
	var memory processMemory
	memory.Size = uint32(unsafe.Sizeof(memory))
	ok, _, callErr := getMemory.Call(uintptr(handle), uintptr(unsafe.Pointer(&memory)), uintptr(memory.Size))
	if ok == 0 {
		return Process{}, callErr
	}
	var created, exited, user, system windows.Filetime
	if err := windows.GetProcessTimes(handle, &created, &exited, &system, &user); err != nil {
		return Process{}, err
	}
	var count uint32
	ok, _, callErr = getHandleCount.Call(uintptr(handle), uintptr(unsafe.Pointer(&count)))
	if ok == 0 {
		return Process{}, callErr
	}
	label, labelError := processLabel(handle, identity.name)
	working, private := uint64(memory.WorkingSet), uint64(memory.Private)
	ticks := func(value windows.Filetime) uint64 { return uint64(value.HighDateTime)<<32 | uint64(value.LowDateTime) }
	cpu := float64(ticks(user)+ticks(system)) / 10000
	return Process{
		PID: identity.pid, ParentPID: identity.parentPid, Name: identity.name,
		CreatedAt: created.Nanoseconds() / 1e6, WorkingSetBytes: &working, PrivateBytes: &private,
		CPUTimeMillis: &cpu, HandleCount: &count, Label: label, LabelError: labelError,
	}, nil
}
