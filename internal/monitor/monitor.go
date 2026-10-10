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
	CPUPercent      *float64 `json:"cpuPercent"`
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

// Sample 是历史序列中的一次轻量采样，只保留数值与可比对的时间基准。
type Sample struct {
	CapturedAt        int64    `json:"capturedAt"`
	ElapsedMillis     uint64   `json:"elapsedMillis"`
	IntervalMillis    uint64   `json:"intervalMillis"`
	PrivateBytes      *uint64  `json:"privateBytes"`
	HeapBytes         uint64   `json:"heapBytes"`
	CPUPercent        *float64 `json:"cpuPercent"`
	PagedPoolBytes    uint64   `json:"pagedPoolBytes"`
	NonpagedPoolBytes uint64   `json:"nonpagedPoolBytes"`
}

// Peak 由原始采样直接更新，不受历史降采样影响，保证峰值精确。
type Peak struct {
	PrivateBytes      *uint64  `json:"privateBytes"`
	HeapBytes         uint64   `json:"heapBytes"`
	CPUPercent        *float64 `json:"cpuPercent"`
	NonpagedPoolBytes uint64   `json:"nonpagedPoolBytes"`
}

// State 是资源监控对前端的只读视图：有界历史、最新进程明细与整个运行期的极值。
type State struct {
	Revision          int64     `json:"revision"`
	Live              bool      `json:"live"`
	StartedAt         int64     `json:"startedAt"`
	SampleCount       int64     `json:"sampleCount"`
	Error             string    `json:"error"`
	Samples           []Sample  `json:"samples"`
	Peaks             Peak      `json:"peaks"`
	AverageCPUPercent *float64  `json:"averageCpuPercent"`
	Snapshot          *Snapshot `json:"snapshot"`
}

const (
	// DefaultSampleInterval 是后台节奏；LiveSampleInterval 是面板观察期间的高频节奏。
	DefaultSampleInterval = 30 * time.Second
	LiveSampleInterval    = 5 * time.Second
	// PanelLease 是面板观察的续租窗口：状态读取会刷新它，停止读取后自动回到后台节奏。
	PanelLease = 3 * LiveSampleInterval
	// HistoryLimit 是算法意义上的上限：降采样后样本数减半，覆盖时长随时间翻倍。
	HistoryLimit = 240
)

// Effect: 仅查询当前进程、Go 运行时与系统计数；includeProcesses 为真时额外枚举当前进程树。
// Guarantee: 不启动后台采样、不强制 GC、不清理系统内存。
func ReadSnapshot(includeProcesses bool) (Snapshot, error) {
	result, err := readPlatformSnapshot(includeProcesses)
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

// Rule: CPU 百分比只在同一进程（PID 与创建时间一致）且累计 CPU 时间单调时有效，按逻辑核数归一化。
func cpuPercent(current Process, previous *Process, elapsedMillis uint64, cores int) *float64 {
	if previous == nil || current.PID != previous.PID || current.CreatedAt != previous.CreatedAt ||
		current.CPUTimeMillis == nil || previous.CPUTimeMillis == nil || elapsedMillis == 0 || cores <= 0 {
		return nil
	}
	delta := *current.CPUTimeMillis - *previous.CPUTimeMillis
	if delta < 0 {
		return nil
	}
	percent := delta / float64(elapsedMillis) / float64(cores) * 100
	return &percent
}

// Effect: 用上一次快照填充主进程与子进程的 CPU 百分比，并返回两次采样之间的单调毫秒间隔；身份不匹配的进程保持未知。
func attachCPU(snapshot *Snapshot, previous *Snapshot, cores int) uint64 {
	if previous == nil || snapshot.ElapsedMillis <= previous.ElapsedMillis {
		return 0
	}
	elapsed := snapshot.ElapsedMillis - previous.ElapsedMillis
	snapshot.Main.CPUPercent = cpuPercent(snapshot.Main, &previous.Main, elapsed, cores)
	if len(snapshot.Children) == 0 {
		return elapsed
	}
	byPID := make(map[uint32]Process, len(previous.Children))
	for _, child := range previous.Children {
		byPID[child.PID] = child
	}
	for index := range snapshot.Children {
		child := &snapshot.Children[index]
		if previousChild, found := byPID[child.PID]; found {
			child.CPUPercent = cpuPercent(*child, &previousChild, elapsed, cores)
		}
	}
	return elapsed
}

func pointer[T any](value T) *T {
	return &value
}
