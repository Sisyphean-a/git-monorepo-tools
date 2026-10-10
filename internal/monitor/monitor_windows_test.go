package monitor

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"testing"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

func TestSnapshotReadsActualProcessAndSystem(t *testing.T) {
	got, err := ReadSnapshot(false)
	if err != nil {
		t.Fatal(err)
	}
	if got.Main.PID != uint32(os.Getpid()) || got.Main.Name == "" || got.Main.WorkingSetBytes == nil || *got.Main.WorkingSetBytes == 0 || got.Main.PrivateBytes == nil || got.Main.HandleCount == nil {
		t.Fatalf("invalid own process data: %+v", got.Main)
	}
	if got.System.TotalBytes == 0 || got.System.NonpagedPoolBytes == 0 || got.Go.HeapBytes == 0 || got.Go.Goroutines == 0 || got.LogicalCPUs == 0 {
		t.Fatalf("invalid snapshot: %+v", got)
	}
	if _, err := json.Marshal(got); err != nil {
		t.Fatal(err)
	}
}

func TestDigestSkipsProcessTree(t *testing.T) {
	digest, err := ReadSnapshot(false)
	if err != nil {
		t.Fatal(err)
	}
	if len(digest.Children) != 0 {
		t.Fatalf("digest enumerated %d children", len(digest.Children))
	}
	encoded, err := json.Marshal(digest)
	if err != nil {
		t.Fatal(err)
	}
	var decoded map[string]any
	if err := json.Unmarshal(encoded, &decoded); err != nil {
		t.Fatal(err)
	}
	if children, found := decoded["children"]; !found || children != nil {
		t.Fatalf("digest children must serialize as null: %v", decoded["children"])
	}
}

func TestSnapshotChildrenDistinguishUnreadFromEmpty(t *testing.T) {
	unread, err := json.Marshal(Snapshot{})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(unread), `"children":null`) {
		t.Fatalf("unread children must be null: %s", unread)
	}
	empty, err := json.Marshal(Snapshot{Children: []Process{}})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(empty), `"children":[]`) {
		t.Fatalf("read-but-empty children must be an array: %s", empty)
	}
}

func TestSnapshotDoesNotLeakQueryHandles(t *testing.T) {
	// Rule: 固定线程并预热运行时，排除 Go 新建线程本身的事件与线程句柄。
	old := runtime.GOMAXPROCS(1)
	defer runtime.GOMAXPROCS(old)
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	for range 2 {
		if _, err := readPlatformSnapshot(false, nil); err != nil {
			t.Fatal(err)
		}
	}
	before := currentHandleCount(t)
	for range 50 {
		if _, err := readPlatformSnapshot(false, nil); err != nil {
			t.Fatal(err)
		}
	}
	if after := currentHandleCount(t); after > before {
		t.Fatalf("query leaked handles: %d -> %d", before, after)
	}
}

func currentHandleCount(t *testing.T) uint32 {
	t.Helper()
	// Rule: 当前进程使用伪句柄读取自身计数，不额外打开句柄。
	var count uint32
	if ok, _, callErr := getHandleCount.Call(uintptr(windows.Handle(^uintptr(0))), uintptr(unsafe.Pointer(&count))); ok == 0 {
		t.Fatalf("GetProcessHandleCount failed: %v", callErr)
	}
	return count
}

func TestMonitorChildHelper(t *testing.T) {
	if os.Getenv("MONITOR_CHILD_HELPER") != "1" {
		return
	}
	fmt.Println("ready")
	time.Sleep(30 * time.Second)
}

func TestSnapshotIncludesLiveChildrenAndOmitsExitedChildren(t *testing.T) {
	cmd := exec.Command(os.Args[0], "-test.run=^TestMonitorChildHelper$")
	cmd.Env = append(os.Environ(), "MONITOR_CHILD_HELPER=1")
	output, err := cmd.StdoutPipe()
	if err != nil {
		t.Fatal(err)
	}
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	stopped := false
	defer func() {
		if !stopped {
			_ = cmd.Process.Kill()
			_ = cmd.Wait()
		}
	}()
	if _, err := bufio.NewReader(output).ReadString('\n'); err != nil {
		t.Fatal(err)
	}
	snapshot, err := ReadSnapshot(true)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, child := range snapshot.Children {
		if child.PID == uint32(cmd.Process.Pid) {
			found = true
			if child.Error != "" || child.PrivateBytes == nil || child.ParentPID != uint32(os.Getpid()) || child.Name == "" {
				t.Fatalf("child unreadable: %+v", child)
			}
		}
	}
	if !found {
		t.Fatal("live child omitted")
	}
	_ = cmd.Process.Kill()
	_ = cmd.Wait()
	stopped = true
	snapshot, err = ReadSnapshot(true)
	if err != nil {
		t.Fatal(err)
	}
	for _, child := range snapshot.Children {
		if child.PID == uint32(cmd.Process.Pid) {
			t.Fatal("exited child retained")
		}
	}
}

func TestCPUPercentRequiresSameProcessAndMonotonicTime(t *testing.T) {
	previous := Process{PID: 7, CreatedAt: 100, CPUTimeMillis: pointer(500.0)}
	current := Process{PID: 7, CreatedAt: 100, CPUTimeMillis: pointer(1250.0)}
	if got := cpuPercent(current, nil, 5_000, 4); got != nil {
		t.Fatalf("first sample must stay unknown: %v", *got)
	}
	if got := cpuPercent(current, &previous, 5_000, 4); got == nil || *got != 3.75 {
		t.Fatalf("unexpected percent: %v", got)
	}
	if got := cpuPercent(current, &Process{PID: 7, CreatedAt: 99, CPUTimeMillis: pointer(500.0)}, 5_000, 4); got != nil {
		t.Fatal("PID reuse must not be compared")
	}
	if got := cpuPercent(Process{PID: 7, CreatedAt: 100, CPUTimeMillis: pointer(400.0)}, &previous, 5_000, 4); got != nil {
		t.Fatal("non-monotonic CPU time must stay unknown")
	}
	if got := cpuPercent(current, &previous, 0, 4); got != nil {
		t.Fatal("zero elapsed must stay unknown")
	}
}

func TestAttachCPUMatchesChildrenByIdentity(t *testing.T) {
	previous := &Snapshot{
		ElapsedMillis: 1_000, LogicalCPUs: 4,
		Main:     Process{PID: 1, CreatedAt: 5, CPUTimeMillis: pointer(500.0)},
		Children: []Process{{PID: 7, CreatedAt: 9, CPUTimeMillis: pointer(100.0)}, {PID: 8, CreatedAt: 2, CPUTimeMillis: pointer(50.0)}},
	}
	current := Snapshot{
		ElapsedMillis: 6_000, LogicalCPUs: 4,
		Main:     Process{PID: 1, CreatedAt: 5, CPUTimeMillis: pointer(1250.0)},
		Children: []Process{{PID: 7, CreatedAt: 9, CPUTimeMillis: pointer(120.0)}, {PID: 9, CreatedAt: 10, CPUTimeMillis: pointer(1.0)}},
	}
	if elapsed := attachCPU(&current, previous, current.LogicalCPUs); elapsed != 5_000 {
		t.Fatalf("unexpected interval: %d", elapsed)
	}
	if current.Main.CPUPercent == nil || *current.Main.CPUPercent != 3.75 {
		t.Fatalf("main percent: %v", current.Main.CPUPercent)
	}
	if current.Children[0].CPUPercent == nil || *current.Children[0].CPUPercent != 0.1 {
		t.Fatalf("child percent: %v", current.Children[0].CPUPercent)
	}
	if current.Children[1].CPUPercent != nil {
		t.Fatal("new child must stay unknown")
	}
	if elapsed := attachCPU(&current, nil, 4); elapsed != 0 {
		t.Fatalf("first sample interval: %d", elapsed)
	}
}

func TestAppendSampleBoundsHistoryAndKeepsEndpoints(t *testing.T) {
	samples := []Sample{}
	total := HistoryLimit * 20
	for index := range total {
		samples = appendSample(samples, Sample{
			CapturedAt: int64(index), ElapsedMillis: uint64(index), IntervalMillis: 1_000,
			HeapBytes: uint64(index), NonpagedPoolBytes: uint64(index), CPUPercent: pointer(float64(index % 100)),
		})
	}
	if len(samples) > HistoryLimit {
		t.Fatalf("history grew past limit: %d", len(samples))
	}
	if samples[0].ElapsedMillis != 0 || samples[0].HeapBytes != 0 || samples[len(samples)-1].ElapsedMillis != uint64(total-1) || samples[len(samples)-1].HeapBytes != uint64(total-1) {
		t.Fatalf("raw endpoints lost: %+v .. %+v", samples[0], samples[len(samples)-1])
	}
	for index := 1; index < len(samples); index++ {
		if samples[index].ElapsedMillis <= samples[index-1].ElapsedMillis {
			t.Fatalf("history timestamps not increasing at %d", index)
		}
		if samples[index].IntervalMillis == 0 {
			t.Fatalf("merged interval lost at %d", index)
		}
	}
}

func TestAppendSampleKeepsEndpointsRawOnDecimation(t *testing.T) {
	samples := []Sample{}
	for index := range HistoryLimit {
		samples = appendSample(samples, Sample{ElapsedMillis: uint64(index), IntervalMillis: 1_000, HeapBytes: uint64(index), NonpagedPoolBytes: uint64(index)})
	}
	if len(samples) != HistoryLimit {
		t.Fatalf("unexpected pre-decimation length: %d", len(samples))
	}
	samples = appendSample(samples, Sample{ElapsedMillis: HistoryLimit, IntervalMillis: 1_000, HeapBytes: HistoryLimit, NonpagedPoolBytes: HistoryLimit})
	if len(samples) != HistoryLimit/2+2 {
		t.Fatalf("unexpected decimated length: %d", len(samples))
	}
	newest := samples[len(samples)-1]
	if newest.ElapsedMillis != HistoryLimit || newest.HeapBytes != HistoryLimit || newest.IntervalMillis != 1_000 {
		t.Fatalf("newest sample must stay raw: %+v", newest)
	}
	if samples[0].HeapBytes != 0 {
		t.Fatalf("launch baseline must stay raw: %+v", samples[0])
	}
	if samples[1].IntervalMillis != 2_000 {
		t.Fatalf("middle samples must merge: %+v", samples[1])
	}
}

func TestMergeSamplesWeightsCPUByInterval(t *testing.T) {
	merged := mergeSamples(
		Sample{ElapsedMillis: 1_000, IntervalMillis: 1_000, CPUPercent: pointer(10.0), PrivateBytes: pointer(uint64(100))},
		Sample{ElapsedMillis: 3_000, IntervalMillis: 2_000, CPUPercent: pointer(40.0), PrivateBytes: pointer(uint64(200))},
	)
	if merged.IntervalMillis != 3_000 || merged.ElapsedMillis != 3_000 {
		t.Fatalf("unexpected span: %+v", merged)
	}
	if merged.CPUPercent == nil || *merged.CPUPercent != 30 {
		t.Fatalf("unexpected weighted percent: %v", merged.CPUPercent)
	}
	if merged.PrivateBytes == nil || *merged.PrivateBytes != 150 {
		t.Fatalf("unexpected average: %v", merged.PrivateBytes)
	}
	if merged := mergeSamples(Sample{CPUPercent: pointer(5.0)}, Sample{}); merged.CPUPercent == nil || *merged.CPUPercent != 5 {
		t.Fatalf("missing CPU must fall back to the known sample: %v", merged.CPUPercent)
	}
}

func TestSamplerStopWaitsForInFlightAndAddsOneClosingSample(t *testing.T) {
	sampler := NewSampler(nil)
	entered, release := make(chan struct{}), make(chan struct{})
	calls := 0
	sampler.read = func(bool) (Snapshot, error) {
		calls++
		if calls == 1 {
			close(entered)
			<-release
		}
		return Snapshot{ElapsedMillis: uint64(calls)}, nil
	}
	released := false
	defer func() {
		if !released {
			close(release)
		}
		sampler.Stop()
	}()
	sampler.Start()
	select {
	case <-entered:
	case <-time.After(2 * time.Second):
		t.Fatal("initial sample did not begin")
	}
	beforeStop := sampler.State().SampleCount
	stopped := make(chan struct{})
	go func() {
		sampler.Stop()
		close(stopped)
	}()
	deadline := time.Now().Add(2 * time.Second)
	for {
		sampler.mu.Lock()
		started := sampler.started
		sampler.mu.Unlock()
		if !started {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("Stop did not request shutdown")
		}
		time.Sleep(time.Millisecond)
	}
	select {
	case <-stopped:
		t.Fatal("Stop returned before the in-flight sample finished")
	default:
	}
	close(release)
	released = true
	select {
	case <-stopped:
	case <-time.After(2 * time.Second):
		t.Fatal("Stop did not finish after the reader was released")
	}
	state := sampler.State()
	if beforeStop != 0 || calls != 2 || state.SampleCount != 2 || state.Samples[0].ElapsedMillis != 1 || state.Samples[1].ElapsedMillis != 2 {
		t.Fatalf("Stop must retain the in-flight sample and exactly one closing sample: before=%d calls=%d state=%+v", beforeStop, calls, state)
	}
	sampler.Stop()
	if sampler.State().SampleCount != 2 {
		t.Fatal("a repeated Stop must not add another closing sample")
	}
}

func TestSamplerStateAndLifecycle(t *testing.T) {
	sampler := NewSampler(nil)
	sampler.Stop()
	if state := sampler.State(); state.Snapshot != nil || state.SampleCount != 0 || state.Samples == nil {
		t.Fatalf("unexpected initial state: %+v", state)
	}
	sampler.sampleOnce()
	state := sampler.State()
	if state.Revision != 1 || state.SampleCount != 1 || state.Snapshot == nil || len(state.Samples) != 1 || state.Snapshot.Main.PID != uint32(os.Getpid()) {
		t.Fatalf("unexpected sampled state: %+v", state)
	}
	if state.Peaks.HeapBytes == 0 || state.AverageCPUPercent != nil {
		t.Fatalf("peaks or first-sample CPU invalid: %+v", state)
	}
	sampler.SetLive(true)
	sampler.sampleOnce()
	state = sampler.State()
	if !state.Live || state.SampleCount != 2 || state.Revision != 2 {
		t.Fatalf("live sampling did not advance: %+v", state)
	}
	sampler.SetLive(false)
	sampler.sampleOnce()
	state = sampler.State()
	if state.Live || state.SampleCount != 3 || len(state.Samples) != 3 || state.Snapshot == nil {
		t.Fatalf("background sampling after live mode did not retain history: %+v", state)
	}
	sampler.Start()
	waitFor := func(minimum int64) {
		deadline := time.Now().Add(2 * time.Second)
		for sampler.State().SampleCount < minimum {
			if time.Now().After(deadline) {
				t.Fatal("sampler did not advance")
			}
			time.Sleep(10 * time.Millisecond)
		}
	}
	waitFor(4)
	sampler.Stop()
	// Guarantee: 停止后可以重新启动，不会重复关闭生命周期通道。
	sampler.Start()
	waitFor(6)
	beforeStop := sampler.State().SampleCount
	sampler.Stop()
	// Rule: State 与 Stop 不是原子操作，在途采样也会收尾；精确补记次数由阻塞读取器的关闭测试验证。
	if after := sampler.State().SampleCount; after <= beforeStop {
		t.Fatalf("shutdown must record the closing boundary: %d -> %d", beforeStop, after)
	}
}

func TestObserveRenewsPanelLeaseAndExpiresToBackground(t *testing.T) {
	sampler := NewSampler(nil)
	sampler.panelLease = 20 * time.Millisecond
	if state := sampler.Observe(); !state.Live {
		t.Fatal("first observe must activate live sampling")
	}
	time.Sleep(2 * time.Millisecond)
	if state := sampler.Observe(); !state.Live {
		t.Fatal("observe must renew the lease")
	}
	time.Sleep(100 * time.Millisecond)
	// Guarantee: 停止读取后租约到期，自动回到后台节奏，不依赖显式关闭。
	if state := sampler.State(); state.Live {
		t.Fatal("lease must expire without reads")
	}
}

func TestSamplerIntervalFollowsLiveMode(t *testing.T) {
	sampler := NewSampler(nil)
	if got := sampler.nextInterval(); got != DefaultSampleInterval {
		t.Fatalf("idle interval: %v", got)
	}
	sampler.SetLive(true)
	if got := sampler.nextInterval(); got != LiveSampleInterval {
		t.Fatalf("live interval: %v", got)
	}
	sampler.SetLive(false)
	if got := sampler.nextInterval(); got != DefaultSampleInterval {
		t.Fatalf("restored interval: %v", got)
	}
}

func TestSamplerKeepsBackgroundCadenceAfterLiveEnds(t *testing.T) {
	sampler := NewSampler(nil)
	sampler.interval = 5 * time.Millisecond
	sampler.liveInterval = 5 * time.Millisecond
	sampler.Start()
	defer sampler.Stop()
	waitForSamples := func(minimum int64) {
		deadline := time.Now().Add(2 * time.Second)
		for sampler.State().SampleCount < minimum {
			if time.Now().After(deadline) {
				t.Fatalf("background sampler stalled at %d", sampler.State().SampleCount)
			}
			time.Sleep(2 * time.Millisecond)
		}
	}
	waitForSamples(2)
	sampler.SetLive(true)
	waitForSamples(sampler.State().SampleCount + 1)
	sampler.SetLive(false)
	idle := sampler.State().SampleCount
	// Guarantee: 面板关闭后计时循环继续按后台节奏采样，不依赖前端轮询。
	waitForSamples(idle + 2)
	if sampler.State().Live {
		t.Fatal("live mode must be off after the panel closes")
	}
}

func TestRecordCPUWeightsBySampledInterval(t *testing.T) {
	sampler := NewSampler(nil)
	sampler.recordCPU(Sample{IntervalMillis: 1_000, CPUPercent: pointer(10.0)})
	sampler.recordCPU(Sample{IntervalMillis: 3_000})
	sampler.recordCPU(Sample{IntervalMillis: 3_000, CPUPercent: pointer(20.0)})
	state := sampler.State()
	if state.AverageCPUPercent == nil || *state.AverageCPUPercent != 17.5 {
		t.Fatalf("average must weight CPU by interval and skip unknown samples: %v", state.AverageCPUPercent)
	}
}

func TestSamplerKeepsLastSnapshotAndRecoversAfterReadFailure(t *testing.T) {
	sampler := NewSampler(nil)
	failing := false
	sampler.read = func(live bool) (Snapshot, error) {
		if failing {
			return Snapshot{}, errors.New("模拟读取失败")
		}
		return ReadSnapshot(live)
	}
	sampler.sampleOnce()
	good := sampler.State()
	failing = true
	sampler.sampleOnce()
	failed := sampler.State()
	if failed.Error == "" || failed.SampleCount != good.SampleCount || len(failed.Samples) != len(good.Samples) {
		t.Fatalf("failure must keep history and record the reason: %+v", failed)
	}
	if failed.Snapshot == nil || failed.Snapshot.Main.PID != good.Snapshot.Main.PID {
		t.Fatal("failure must keep the last good snapshot")
	}
	failing = false
	sampler.sampleOnce()
	recovered := sampler.State()
	if recovered.Error != "" || recovered.SampleCount != good.SampleCount+1 {
		t.Fatalf("sampler did not recover: %+v", recovered)
	}
}

func TestStateJSONContract(t *testing.T) {
	sampler := NewSampler(nil)
	sampler.sampleOnce()
	encoded, err := json.Marshal(sampler.State())
	if err != nil {
		t.Fatal(err)
	}
	var decoded map[string]any
	if err := json.Unmarshal(encoded, &decoded); err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"revision", "live", "startedAt", "sampleCount", "error", "samples", "peaks", "averageCpuPercent", "snapshot"} {
		if _, found := decoded[key]; !found {
			t.Fatalf("state JSON is missing %q", key)
		}
	}
	samples, ok := decoded["samples"].([]any)
	if !ok || len(samples) != 1 {
		t.Fatalf("samples must serialize as a non-null array: %v", decoded["samples"])
	}
	sample, ok := samples[0].(map[string]any)
	if !ok {
		t.Fatal("sample must be an object")
	}
	for _, key := range []string{"capturedAt", "elapsedMillis", "intervalMillis", "privateBytes", "heapBytes", "cpuPercent", "pagedPoolBytes", "nonpagedPoolBytes"} {
		if _, found := sample[key]; !found {
			t.Fatalf("sample JSON is missing %q", key)
		}
	}
	snapshot, ok := decoded["snapshot"].(map[string]any)
	if !ok {
		t.Fatal("snapshot must be an object")
	}
	if children, found := snapshot["children"]; !found || children != nil {
		t.Fatalf("digest snapshot must keep children null: %v", snapshot["children"])
	}
}

func TestNativeMemoryStructureSizes(t *testing.T) {
	processSize, systemSize := uintptr(80), uintptr(104)
	if unsafe.Sizeof(uintptr(0)) == 4 {
		processSize, systemSize = 44, 56
	}
	if unsafe.Sizeof(processMemory{}) != processSize || unsafe.Sizeof(performanceInfo{}) != systemSize {
		t.Fatal("Win32 ABI layout does not match")
	}
}

func BenchmarkReadSnapshotDigest(b *testing.B) {
	b.ReportAllocs()
	for b.Loop() {
		if _, err := ReadSnapshot(false); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkReadSnapshotWithProcesses(b *testing.B) {
	b.ReportAllocs()
	for b.Loop() {
		if _, err := ReadSnapshot(true); err != nil {
			b.Fatal(err)
		}
	}
}
