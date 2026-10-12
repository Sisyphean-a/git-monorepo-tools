package monitor

import (
	"math"
	"sync"
	"time"
)

// Sampler 拥有资源监控的生命周期：应用启动即开始后台采样，面板打开时切到高频并附带进程树，应用关闭时停止。
type Sampler struct {
	mu             sync.Mutex
	read           func(bool) (Snapshot, error)
	interval       time.Duration
	liveInterval   time.Duration
	panelLease     time.Duration
	panelUntil     int64
	started        bool
	startedAt      int64
	revision       int64
	sampleCount    int64
	lastError      string
	history        history
	peaks          Peak
	cpuWeightedSum float64
	cpuWeight      float64
	previous       *Snapshot
	latest         *Snapshot
	wake           chan struct{}
	stop           chan struct{}
	done           chan struct{}
}

func NewSampler(readTerminals func() []TerminalScope) *Sampler {
	return &Sampler{
		interval:     DefaultSampleInterval,
		liveInterval: LiveSampleInterval,
		panelLease:   PanelLease,
		history:      newHistory(),
		read: func(live bool) (Snapshot, error) {
			var scopes []TerminalScope
			if live && readTerminals != nil {
				scopes = readTerminals()
			}
			return readSnapshot(live, scopes)
		},
		wake: make(chan struct{}, 1),
	}
}

// Flow: Start 先立即采样一次记录启动基线，随后按当前节奏采样；重复调用无副作用，Stop 后可以再次 Start。
func (s *Sampler) Start() {
	s.mu.Lock()
	if s.started {
		s.mu.Unlock()
		return
	}
	s.started = true
	s.startedAt = time.Now().UnixMilli()
	stop, done := make(chan struct{}), make(chan struct{})
	s.stop, s.done = stop, done
	s.mu.Unlock()
	go s.run(stop, done)
}

// Guarantee: Stop 先停止采样循环，再补一次轻量采样把关闭边界记入历史；重复调用与未启动时调用都安全。
func (s *Sampler) Stop() {
	s.mu.Lock()
	if !s.started {
		s.mu.Unlock()
		return
	}
	s.started = false
	stop, done := s.stop, s.done
	s.mu.Unlock()
	close(stop)
	<-done
	s.capture(false)
}

// Effect: 面板每次读取状态都续租高频采样窗口，并在从后台进入观察时立即唤醒采样；
// 停止读取后租约到期自动回到后台节奏，不依赖读侧的显式关闭。
func (s *Sampler) Observe() State {
	now := time.Now().UnixMilli()
	s.mu.Lock()
	activated := !s.liveLocked()
	s.panelUntil = now + s.panelLease.Milliseconds()
	s.mu.Unlock()
	if activated {
		select {
		case s.wake <- struct{}{}:
		default:
		}
	}
	return s.State()
}

// Effect: 显式切换观察窗口；面板打开时等价于续租，关闭时立即回到后台节奏。
func (s *Sampler) SetLive(live bool) {
	now := time.Now().UnixMilli()
	s.mu.Lock()
	activated := live && !s.liveLocked()
	if live {
		s.panelUntil = now + s.panelLease.Milliseconds()
	} else {
		s.panelUntil = 0
	}
	s.mu.Unlock()
	if activated {
		select {
		case s.wake <- struct{}{}:
		default:
		}
	}
}

func (s *Sampler) liveLocked() bool {
	return s.panelUntil > time.Now().UnixMilli()
}

// Flow: State 在锁内复制切片并返回只读视图，调用方不会看到采样过程中的中间状态。
func (s *Sampler) State() State {
	s.mu.Lock()
	defer s.mu.Unlock()
	state := State{
		Revision: s.revision, Live: s.liveLocked(), StartedAt: s.startedAt, SampleCount: s.sampleCount,
		Error: s.lastError, Peaks: s.peaks, Samples: s.history.samples(),
	}
	if s.cpuWeight > 0 {
		state.AverageCPUPercent = pointer(s.cpuWeightedSum / s.cpuWeight)
	}
	if s.latest != nil {
		snapshot := *s.latest
		// Guarantee: nil 子进程切片表示未枚举进程树，复制时保持 null，不降级成空数组。
		if s.latest.Children != nil {
			snapshot.Children = append([]Process{}, s.latest.Children...)
		}
		if s.latest.Terminals != nil {
			snapshot.Terminals = append([]TerminalScope{}, s.latest.Terminals...)
			for index := range snapshot.Terminals {
				snapshot.Terminals[index].Members = append([]ProcessIdentity{}, s.latest.Terminals[index].Members...)
			}
		}
		state.Snapshot = &snapshot
	}
	return state
}

func (s *Sampler) run(stop, done chan struct{}) {
	defer close(done)
	timer := time.NewTimer(0)
	defer timer.Stop()
	for {
		// Guarantee: 停止优先于挂起的唤醒，避免关闭时在补记之外再采一次。
		select {
		case <-stop:
			return
		default:
		}
		select {
		case <-stop:
			return
		case <-s.wake:
		case <-timer.C:
		}
		s.sampleOnce()
		if !timer.Stop() {
			select {
			case <-timer.C:
			default:
			}
		}
		timer.Reset(s.nextInterval())
	}
}

func (s *Sampler) nextInterval() time.Duration {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.liveLocked() {
		return s.liveInterval
	}
	return s.interval
}

// Flow: 读取一次当前节奏的快照并折算 CPU 差值后写入历史；失败只记录原因，保留上一次快照与已有历史。
func (s *Sampler) sampleOnce() {
	s.mu.Lock()
	live := s.liveLocked()
	s.mu.Unlock()
	s.capture(live)
}

func (s *Sampler) capture(live bool) {
	snapshot, err := s.read(live)
	s.mu.Lock()
	defer s.mu.Unlock()
	s.revision++
	if err != nil {
		s.lastError = err.Error()
		return
	}
	s.lastError = ""
	interval := attachCPU(&snapshot, s.previous, snapshot.LogicalCPUs)
	attachFilePoolRate(&snapshot, s.previous)
	s.previous = &snapshot
	s.latest = &snapshot
	sample := Sample{
		CapturedAt: snapshot.CapturedAt, ElapsedMillis: snapshot.ElapsedMillis, IntervalMillis: interval,
		PrivateBytes: snapshot.Main.PrivateBytes, HeapBytes: snapshot.Go.HeapBytes,
		CPUPercent: snapshot.Main.CPUPercent, PagedPoolBytes: snapshot.System.PagedPoolBytes,
		NonpagedPoolBytes: snapshot.System.NonpagedPoolBytes,
	}
	if file := snapshot.System.FilePool; file != nil {
		sample.FilePoolCount = pointer(file.Count)
		sample.FilePoolBytes = pointer(file.Bytes)
	}
	s.sampleCount++
	s.history.add(sample)
	s.recordPeak(sample)
	s.recordCPU(sample)
}

func (s *Sampler) recordPeak(sample Sample) {
	if sample.PrivateBytes != nil && (s.peaks.PrivateBytes == nil || *sample.PrivateBytes > *s.peaks.PrivateBytes) {
		s.peaks.PrivateBytes = pointer(*sample.PrivateBytes)
	}
	if sample.HeapBytes > s.peaks.HeapBytes {
		s.peaks.HeapBytes = sample.HeapBytes
	}
	if sample.NonpagedPoolBytes > s.peaks.NonpagedPoolBytes {
		s.peaks.NonpagedPoolBytes = sample.NonpagedPoolBytes
	}
	if sample.CPUPercent != nil && (s.peaks.CPUPercent == nil || *sample.CPUPercent > *s.peaks.CPUPercent) {
		s.peaks.CPUPercent = pointer(*sample.CPUPercent)
	}
}

func (s *Sampler) recordCPU(sample Sample) {
	if sample.CPUPercent == nil || sample.IntervalMillis == 0 {
		return
	}
	s.cpuWeightedSum += *sample.CPUPercent * float64(sample.IntervalMillis)
	s.cpuWeight += float64(sample.IntervalMillis)
}

// Rule: 历史按等宽时间桶聚合，而不是按样本顺序逐段降采样：每个点代表一个宽度相同的桶（尾部未填满的桶更短），
// 桶内数值按各样本覆盖的时长加权平均，因此后台 30 秒与面板 5 秒两种采样频率落在同一组点上，不会出现旧数据被反复平均、新数据保持原始的分段曲线。
// 桶数超过上限时把桶宽翻倍并整体重新分桶，分辨率对整段历史同时下降，样本数减半、覆盖时长随运行期翻倍。
type history struct {
	width   uint64
	buckets []bucket
}

func newHistory() history {
	return history{width: uint64(DefaultSampleInterval / time.Millisecond)}
}

// bucket 是一个等宽时间桶的累加值；时间戳取桶内最新样本，使曲线右端对齐当前时刻。
type bucket struct {
	CapturedAt     int64
	ElapsedMillis  uint64
	IntervalMillis uint64
	Private        weighted
	Heap           weighted
	CPU            weighted
	Paged          weighted
	Nonpaged       weighted
	FileCount      weighted
	FileBytes      weighted
}

// weighted 按覆盖时长累加一个指标：未知样本既不进入平均值也不占用时长权重，避免把缺失当成零；
// fallback 保留最近一个已知值，让还没有任何覆盖时长的桶（只有启动基线）仍然给出原始数值。
type weighted struct {
	sum      float64
	weight   uint64
	fallback float64
	known    bool
}

func (w *weighted) add(value float64, weight uint64) {
	w.sum += value * float64(weight)
	w.weight += weight
	w.fallback, w.known = value, true
}

func (w *weighted) addOptional(value *uint64, weight uint64) {
	if value != nil {
		w.add(float64(*value), weight)
	}
}

func (w *weighted) addOptionalPercent(value *float64, weight uint64) {
	if value != nil {
		w.add(*value, weight)
	}
}

// Flow: 合并直接相加总和与权重，不在平均值之上再平均；已知值以较新的桶为准。
func (w *weighted) merge(older weighted) {
	w.sum += older.sum
	w.weight += older.weight
	if !w.known && older.known {
		w.fallback, w.known = older.fallback, true
	}
}

func (w weighted) mean() (float64, bool) {
	if w.weight > 0 {
		return w.sum / float64(w.weight), true
	}
	return w.fallback, w.known
}

// Flow: 把样本并入它所属的时间桶：仍是最后一个桶的跨度就继续累加，否则新开一个桶；桶数超过上限时先整体加宽。
// Rule: 样本覆盖的区间是它与上一次采样之间的时间，统一记入本次采样所属的桶。
func (h *history) add(sample Sample) {
	index := sample.ElapsedMillis / h.width
	last := len(h.buckets) - 1
	if last >= 0 && h.buckets[last].ElapsedMillis/h.width == index {
		h.buckets[last] = mergeBuckets(h.buckets[last], newBucket(sample))
	} else {
		h.buckets = append(h.buckets, newBucket(sample))
	}
	if len(h.buckets) > HistoryLimit {
		h.widen()
	}
}

// Flow: 桶数超过上限时把桶宽翻倍并按新宽度重新分组；分组沿用已累加的总和与权重，平均值不因重分桶而改变。
func (h *history) widen() {
	h.width *= 2
	merged := make([]bucket, 0, len(h.buckets)/2+1)
	for _, current := range h.buckets {
		if last := len(merged) - 1; last >= 0 && merged[last].ElapsedMillis/h.width == current.ElapsedMillis/h.width {
			merged[last] = mergeBuckets(merged[last], current)
			continue
		}
		merged = append(merged, current)
	}
	h.buckets = merged
}

// Flow: 把桶还原成前端使用的序列；数值取桶内的加权平均值，始终未知的指标保持 null。
func (h *history) samples() []Sample {
	samples := make([]Sample, 0, len(h.buckets))
	for _, current := range h.buckets {
		samples = append(samples, current.sample())
	}
	return samples
}

func newBucket(sample Sample) bucket {
	current := bucket{CapturedAt: sample.CapturedAt, ElapsedMillis: sample.ElapsedMillis, IntervalMillis: sample.IntervalMillis}
	current.Private.addOptional(sample.PrivateBytes, sample.IntervalMillis)
	current.Heap.add(float64(sample.HeapBytes), sample.IntervalMillis)
	current.CPU.addOptionalPercent(sample.CPUPercent, sample.IntervalMillis)
	current.Paged.add(float64(sample.PagedPoolBytes), sample.IntervalMillis)
	current.Nonpaged.add(float64(sample.NonpagedPoolBytes), sample.IntervalMillis)
	current.FileCount.addOptional(sample.FilePoolCount, sample.IntervalMillis)
	current.FileBytes.addOptional(sample.FilePoolBytes, sample.IntervalMillis)
	return current
}

func mergeBuckets(older, newer bucket) bucket {
	merged := newer
	merged.IntervalMillis += older.IntervalMillis
	merged.Private.merge(older.Private)
	merged.Heap.merge(older.Heap)
	merged.CPU.merge(older.CPU)
	merged.Paged.merge(older.Paged)
	merged.Nonpaged.merge(older.Nonpaged)
	merged.FileCount.merge(older.FileCount)
	merged.FileBytes.merge(older.FileBytes)
	return merged
}

func (b bucket) sample() Sample {
	sample := Sample{CapturedAt: b.CapturedAt, ElapsedMillis: b.ElapsedMillis, IntervalMillis: b.IntervalMillis}
	if value, known := b.Private.mean(); known {
		sample.PrivateBytes = pointer(roundedBytes(value))
	}
	if value, known := b.Heap.mean(); known {
		sample.HeapBytes = roundedBytes(value)
	}
	if value, known := b.CPU.mean(); known {
		sample.CPUPercent = pointer(value)
	}
	if value, known := b.Paged.mean(); known {
		sample.PagedPoolBytes = roundedBytes(value)
	}
	if value, known := b.Nonpaged.mean(); known {
		sample.NonpagedPoolBytes = roundedBytes(value)
	}
	if value, known := b.FileCount.mean(); known {
		sample.FilePoolCount = pointer(roundedBytes(value))
	}
	if value, known := b.FileBytes.mean(); known {
		sample.FilePoolBytes = pointer(roundedBytes(value))
	}
	return sample
}

// Guarantee: 浮点累加可能略超出 uint64 上限，转换前先夹紧，避免饱和计数值回绕成 0。
func roundedBytes(value float64) uint64 {
	if value <= 0 {
		return 0
	}
	if value >= math.MaxUint64 {
		return math.MaxUint64
	}
	return uint64(math.Round(value))
}
