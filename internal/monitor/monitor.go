package monitor

import (
	"runtime"
	"time"
)

type Process struct {
	PID             uint32   `json:"pid"`
	ParentPID       uint32   `json:"parentPid"`
	Name            string   `json:"name"`
	CreatedAt       int64    `json:"createdAt"`
	WorkingSetBytes *uint64  `json:"workingSetBytes"`
	PrivateBytes    *uint64  `json:"privateBytes"`
	CPUTimeMillis   *float64 `json:"cpuTimeMillis"`
	HandleCount     *uint32  `json:"handleCount"`
	Error           string   `json:"error,omitempty"`
}

type GoMemory struct {
	HeapBytes     uint64 `json:"heapBytes"`
	ReservedBytes uint64 `json:"reservedBytes"`
	HeapObjects   uint64 `json:"heapObjects"`
	Goroutines    int    `json:"goroutines"`
	GCCount       uint32 `json:"gcCount"`
}

type SystemMemory struct {
	TotalBytes        uint64 `json:"totalBytes"`
	AvailableBytes    uint64 `json:"availableBytes"`
	PagedPoolBytes    uint64 `json:"pagedPoolBytes"`
	NonpagedPoolBytes uint64 `json:"nonpagedPoolBytes"`
}

type Snapshot struct {
	CapturedAt    int64        `json:"capturedAt"`
	ElapsedMillis uint64       `json:"elapsedMillis"`
	LogicalCPUs   int          `json:"logicalCpus"`
	Main          Process      `json:"main"`
	Children      []Process    `json:"children"`
	Go            GoMemory     `json:"go"`
	System        SystemMemory `json:"system"`
}

// Effect: 仅查询当前进程树、运行时与系统计数；不启动采样后台任务、不强制 GC。
func ReadSnapshot() (Snapshot, error) {
	result, err := readPlatformSnapshot()
	if err != nil {
		return Snapshot{}, err
	}
	var memory runtime.MemStats
	runtime.ReadMemStats(&memory)
	result.Go = GoMemory{memory.HeapAlloc, memory.Sys, memory.HeapObjects, runtime.NumGoroutine(), memory.NumGC}
	result.LogicalCPUs = runtime.NumCPU()
	result.CapturedAt = time.Now().UnixMilli()
	return result, nil
}
