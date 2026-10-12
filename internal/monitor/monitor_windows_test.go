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

func TestHistoryWeightsValuesByCoveredSpan(t *testing.T) {
	history := newHistory()
	width := history.width
	history.add(Sample{ElapsedMillis: 0, PrivateBytes: pointer(uint64(100)), HeapBytes: 1_000})
	history.add(Sample{ElapsedMillis: 10_000, IntervalMillis: 10_000, PrivateBytes: pointer(uint64(110)), HeapBytes: 1_100, CPUPercent: pointer(10.0)})
	history.add(Sample{ElapsedMillis: 25_000, IntervalMillis: 15_000, PrivateBytes: pointer(uint64(120)), HeapBytes: 1_200, CPUPercent: pointer(40.0)})
	history.add(Sample{ElapsedMillis: 40_000, IntervalMillis: 15_000, PrivateBytes: pointer(uint64(130)), HeapBytes: 1_500, CPUPercent: pointer(50.0)})
	samples := history.samples()
	if len(samples) != 2 || history.width != width {
		t.Fatalf("unexpected buckets: %+v at width %d", samples, history.width)
	}
	// 桶内按覆盖时长加权：(10*1100 + 15*1200) / 25 = 1160，按样本数量直接平均会得到 1150。
	first := samples[0]
	if first.IntervalMillis != 25_000 || first.ElapsedMillis != 25_000 || first.HeapBytes != 1_160 {
		t.Fatalf("first bucket must be the covered-span average: %+v", first)
	}
	if first.PrivateBytes == nil || *first.PrivateBytes != 116 || first.CPUPercent == nil || *first.CPUPercent != 28 {
		t.Fatalf("unexpected weighted values: %+v", first)
	}
	// 尾部未填满的桶更短，并携带桶内最新样本的时间戳。
	if last := samples[1]; last.IntervalMillis != 15_000 || last.ElapsedMillis != 40_000 || last.HeapBytes != 1_500 || last.CPUPercent == nil || *last.CPUPercent != 50 {
		t.Fatalf("trailing bucket must keep its own span: %+v", last)
	}
}

func TestHistoryIgnoresSampleRateChanges(t *testing.T) {
	// 同一个单调过程按后台 30 秒与面板 5 秒采样：点的数量与位置必须一致，数值最多相差半个桶宽的变化量。
	const rate = 10
	width := newHistory().width
	grow := func(elapsed uint64) uint64 { return 10_000_000 + elapsed*rate }
	background, live := newHistory(), newHistory()
	for elapsed := uint64(30_000); elapsed <= 3_600_000; elapsed += 30_000 {
		background.add(Sample{ElapsedMillis: elapsed, IntervalMillis: 30_000, HeapBytes: grow(elapsed)})
	}
	for elapsed := uint64(30_000); elapsed <= 3_600_000; elapsed += 5_000 {
		live.add(Sample{ElapsedMillis: elapsed, IntervalMillis: 5_000, HeapBytes: grow(elapsed)})
	}
	slow, fast := background.samples(), live.samples()
	if len(slow) != 120 || len(fast) != 120 {
		t.Fatalf("sampling rate must not change the point grid: %d vs %d", len(slow), len(fast))
	}
	abs := func(value int64) int64 {
		if value < 0 {
			return -value
		}
		return value
	}
	for index := range slow {
		// 同一个桶的样本位置随节奏变化，但点始终落在自己的桶内。
		if abs(int64(slow[index].ElapsedMillis)-int64(fast[index].ElapsedMillis)) > int64(width) {
			t.Fatalf("point %d sits at %d for background and %d for live sampling", index, slow[index].ElapsedMillis, fast[index].ElapsedMillis)
		}
		if abs(int64(slow[index].HeapBytes)-int64(fast[index].HeapBytes)) > int64(width/2*rate) {
			t.Fatalf("point %d differs by more than half a bucket: %d vs %d", index, slow[index].HeapBytes, fast[index].HeapBytes)
		}
	}
}

func TestHistoryKeepsLaunchBaselineWithoutCoveredSpan(t *testing.T) {
	history := newHistory()
	history.add(Sample{ElapsedMillis: 1_000, PrivateBytes: pointer(uint64(70)), HeapBytes: 800})
	samples := history.samples()
	if len(samples) != 1 || samples[0].PrivateBytes == nil || *samples[0].PrivateBytes != 70 || samples[0].HeapBytes != 800 {
		t.Fatalf("launch baseline must stay the first point: %+v", samples)
	}
	if samples[0].CPUPercent != nil {
		t.Fatal("a sample without a predecessor must not invent CPU")
	}
}

func TestHistoryKeepsEqualSpansAcrossWidening(t *testing.T) {
	history := newHistory()
	step := history.width
	total := HistoryLimit * 20
	for index := range total {
		interval := step
		if index == 0 {
			interval = 0
		}
		history.add(Sample{
			ElapsedMillis: uint64(index) * step, IntervalMillis: interval,
			HeapBytes: uint64(index) * 10, NonpagedPoolBytes: uint64(index), CPUPercent: pointer(float64(index % 100)),
		})
	}
	if history.width <= step {
		t.Fatalf("history must widen instead of dropping points: width %d", history.width)
	}
	span := history.width / step
	samples := history.samples()
	if len(samples) > HistoryLimit {
		t.Fatalf("history grew past limit: %d", len(samples))
	}
	if samples[0].ElapsedMillis != uint64(span-1)*step || samples[len(samples)-1].ElapsedMillis != uint64(total-1)*step {
		t.Fatalf("history lost its endpoints: %+v .. %+v", samples[0], samples[len(samples)-1])
	}
	for index := 1; index < len(samples); index++ {
		if samples[index].ElapsedMillis <= samples[index-1].ElapsedMillis {
			t.Fatalf("history timestamps not increasing at %d", index)
		}
	}
	// Rule: 所有完成的桶覆盖同样的时长；只有启动基线没有前序样本，末尾未填满的桶更短。
	// 逐段降采样会让旧点覆盖几分钟、新点只覆盖一次采样，这里任何点都不能比其他点细。
	for index := 1; index+1 < len(samples); index++ {
		if samples[index].IntervalMillis != history.width {
			t.Fatalf("point %d covers %d ms, want the shared bucket width %d", index, samples[index].IntervalMillis, history.width)
		}
	}
	// 启动基线没有前序样本，它所在的首桶比其它桶少一次采样间隔；末尾未填满的桶更短。
	if samples[0].IntervalMillis != history.width-step {
		t.Fatalf("first bucket covers %d ms, want one sampling step less than %d", samples[0].IntervalMillis, history.width)
	}
	if samples[0].HeapBytes != 5*span {
		t.Fatalf("first bucket must average its samples: %+v", samples[0])
	}
	if last := samples[len(samples)-1]; last.IntervalMillis == 0 || last.IntervalMillis > history.width {
		t.Fatalf("trailing bucket covers %d ms, want at most %d", last.IntervalMillis, history.width)
	}
}

func TestBucketWeightsCPUByCoveredSpan(t *testing.T) {
	current := newBucket(Sample{ElapsedMillis: 1_000, IntervalMillis: 1_000, CPUPercent: pointer(10.0), PrivateBytes: pointer(uint64(100))})
	current = mergeBuckets(current, newBucket(Sample{ElapsedMillis: 3_000, IntervalMillis: 2_000, CPUPercent: pointer(40.0), PrivateBytes: pointer(uint64(200))}))
	sample := current.sample()
	if sample.IntervalMillis != 3_000 || sample.ElapsedMillis != 3_000 {
		t.Fatalf("unexpected span: %+v", sample)
	}
	if sample.CPUPercent == nil || *sample.CPUPercent != 30 {
		t.Fatalf("unexpected weighted percent: %v", sample.CPUPercent)
	}
	if sample.PrivateBytes == nil || *sample.PrivateBytes != 167 {
		t.Fatalf("unexpected weighted average: %v", sample.PrivateBytes)
	}
	// 未知 CPU 不参与平均：只有已知样本的时长决定结果，也不会把缺失当成 0。
	unknown := mergeBuckets(newBucket(Sample{IntervalMillis: 1_000, CPUPercent: pointer(5.0)}), newBucket(Sample{ElapsedMillis: 1_000, IntervalMillis: 1_000}))
	if value := unknown.sample().CPUPercent; value == nil || *value != 5 {
		t.Fatalf("unknown CPU must not be averaged as zero: %v", value)
	}
	// 零覆盖桶回退到已知原始值。
	if value := newBucket(Sample{CPUPercent: pointer(7.5)}).sample().CPUPercent; value == nil || *value != 7.5 {
		t.Fatalf("zero-span bucket must fall back to the known value: %v", value)
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
		return Snapshot{ElapsedMillis: uint64(calls) * uint64(DefaultSampleInterval/time.Millisecond)}, nil
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
	// Guarantee: 每次采样都落在自己的时间桶里，停止必须保留在途采样并只补记一次关闭边界。
	if beforeStop != 0 || calls != 2 || state.SampleCount != 2 || len(state.Samples) != 2 ||
		state.Samples[0].ElapsedMillis != uint64(DefaultSampleInterval/time.Millisecond) || state.Samples[1].ElapsedMillis != 2*uint64(DefaultSampleInterval/time.Millisecond) {
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
	// 三次采样在毫秒内完成，落在同一个时间桶里；原始次数由 SampleCount 记录。
	if state.Live || state.SampleCount != 3 || len(state.Samples) == 0 || state.Snapshot == nil {
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
