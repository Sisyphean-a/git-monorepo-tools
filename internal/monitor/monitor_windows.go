package monitor

import (
	"errors"
	"fmt"
	"os"
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

func readPlatformSnapshot() (Snapshot, error) {
	root := uint32(os.Getpid())
	rows, err := processEntries()
	if err != nil {
		return Snapshot{}, err
	}
	main, err := readProcess(root, rows[root])
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
		Main: main, Children: []Process{}, ElapsedMillis: elapsed,
		System: SystemMemory{
			TotalBytes:        uint64(info.PhysicalTotal) * uint64(info.PageSize),
			AvailableBytes:    uint64(info.PhysicalAvailable) * uint64(info.PageSize),
			PagedPoolBytes:    uint64(info.KernelPaged) * uint64(info.PageSize),
			NonpagedPoolBytes: uint64(info.KernelNonpaged) * uint64(info.PageSize),
		},
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
			child, readErr := readProcess(pid, entry)
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
	sort.Slice(result.Children, func(i, j int) bool { return result.Children[i].PID < result.Children[j].PID })
	return result, nil
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

func readProcess(pid uint32, entry windows.ProcessEntry32) (Process, error) {
	// Rule: 当前进程使用伪句柄，避免把采样器自身临时句柄算入读数。
	handle := windows.Handle(^uintptr(0))
	if pid != uint32(os.Getpid()) {
		var err error
		handle, err = windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION, false, pid)
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
	working, private := uint64(memory.WorkingSet), uint64(memory.Private)
	ticks := func(value windows.Filetime) uint64 { return uint64(value.HighDateTime)<<32 | uint64(value.LowDateTime) }
	cpu := float64(ticks(user)+ticks(system)) / 10000
	return Process{
		PID: pid, ParentPID: entry.ParentProcessID, Name: windows.UTF16ToString(entry.ExeFile[:]),
		CreatedAt: created.Nanoseconds() / 1e6, WorkingSetBytes: &working, PrivateBytes: &private,
		CPUTimeMillis: &cpu, HandleCount: &count,
	}, nil
}
