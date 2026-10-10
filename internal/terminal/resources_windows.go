package terminal

import (
	"errors"
	"fmt"
	"unsafe"

	"golang.org/x/sys/windows"
)

var isProcessInJob = windows.NewLazySystemDLL("kernel32.dll").NewProc("IsProcessInJob")

type jobProcessList struct {
	Assigned, Listed uint32
	First            uintptr
}

// Guarantee: 查询与 Wait 的句柄回收互斥，只读取本会话持有的 Job；不停止进程、不改变 Job 配置。
func (h *conptyHost) ResourceProcesses() (ProcessIdentity, []ProcessIdentity, error) {
	h.handlesMu.RLock()
	defer h.handlesMu.RUnlock()
	if h.handlesClosed {
		return ProcessIdentity{}, nil, errors.New("终端已结束，本次无法读取进程归属")
	}
	root, err := terminalProcessIdentity(h.process)
	if err != nil {
		return ProcessIdentity{}, nil, fmt.Errorf("读取终端根进程身份失败：%w", err)
	}
	pids, err := readJobProcessIDs(h.job)
	if err != nil {
		return root, nil, fmt.Errorf("读取终端 Job 成员失败：%w", err)
	}
	members := make([]ProcessIdentity, 0, len(pids))
	var failures []error
	for _, pid := range pids {
		handle, openErr := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION, false, pid)
		if errors.Is(openErr, windows.ERROR_INVALID_PARAMETER) || errors.Is(openErr, windows.ERROR_NOT_FOUND) {
			continue
		}
		if openErr != nil {
			failures = append(failures, fmt.Errorf("读取 Job 成员 PID %d 失败：%w", pid, openErr))
			continue
		}
		identity, identityErr := verifiedJobMember(handle, h.job)
		_ = windows.CloseHandle(handle)
		if identityErr != nil {
			failures = append(failures, fmt.Errorf("验证 Job 成员 PID %d 失败：%w", pid, identityErr))
			continue
		}
		if identity.PID != 0 {
			members = append(members, identity)
		}
	}
	return root, members, errors.Join(failures...)
}

func terminalProcessIdentity(handle windows.Handle) (ProcessIdentity, error) {
	pid, err := windows.GetProcessId(handle)
	if err != nil {
		return ProcessIdentity{}, err
	}
	var created, exited, kernel, user windows.Filetime
	if err := windows.GetProcessTimes(handle, &created, &exited, &kernel, &user); err != nil {
		return ProcessIdentity{}, err
	}
	return ProcessIdentity{PID: pid, CreatedAt: created.Nanoseconds() / 1e6}, nil
}

func verifiedJobMember(handle, job windows.Handle) (ProcessIdentity, error) {
	var member int32
	ok, _, err := isProcessInJob.Call(uintptr(handle), uintptr(job), uintptr(unsafe.Pointer(&member)))
	if ok == 0 {
		return ProcessIdentity{}, err
	}
	if member == 0 {
		return ProcessIdentity{}, nil
	}
	// Rule: 先用句柄确认 Job 成员，再记录创建时间；后续采样必须匹配 PID 与创建时间，防止退出后的 PID 复用造成串项目。
	return terminalProcessIdentity(handle)
}

func readJobProcessIDs(job windows.Handle) ([]uint32, error) {
	buffer := make([]byte, unsafe.Sizeof(jobProcessList{}))
	for {
		var returned uint32
		err := windows.QueryInformationJobObject(job, windows.JobObjectBasicProcessIdList, uintptr(unsafe.Pointer(&buffer[0])), uint32(len(buffer)), &returned)
		header := *(*jobProcessList)(unsafe.Pointer(&buffer[0]))
		if errors.Is(err, windows.ERROR_MORE_DATA) || errors.Is(err, windows.ERROR_INSUFFICIENT_BUFFER) {
			size := max(uint64(returned), uint64(unsafe.Offsetof(header.First))+uint64(header.Assigned)*uint64(unsafe.Sizeof(uintptr(0))), uint64(len(buffer))*2)
			if size > uint64(^uint32(0)) || size > uint64(^uint(0)>>1) {
				return nil, errors.New("终端 Job 成员表超过 API 可表示长度")
			}
			buffer = make([]byte, int(size))
			continue
		}
		if err != nil {
			return nil, err
		}
		offset, stride := int(unsafe.Offsetof(header.First)), int(unsafe.Sizeof(uintptr(0)))
		if uint64(header.Listed) > uint64((len(buffer)-offset)/stride) || header.Listed < header.Assigned {
			return nil, errors.New("终端 Job 成员表不完整")
		}
		result := make([]uint32, 0, header.Listed)
		for index := 0; index < int(header.Listed); index++ {
			pid := *(*uintptr)(unsafe.Pointer(&buffer[offset+index*stride]))
			if uint64(pid) > uint64(^uint32(0)) {
				return nil, errors.New("终端 Job 返回了无效 PID")
			}
			result = append(result, uint32(pid))
		}
		return result, nil
	}
}
