package monitor

import (
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
	samples        []Sample
	peaks          Peak
	cpuWeightedSum float64
	cpuWeight      float64
	previous       *Snapshot
	latest         *Snapshot
	wake           chan struct{}
	stop           chan struct{}
	done           chan struct{}
}

func NewSampler() *Sampler {
	return &Sampler{
		interval:     DefaultSampleInterval,
		liveInterval: LiveSampleInterval,
		panelLease:   PanelLease,
		samples:      []Sample{},
		read:         ReadSnapshot,
		wake:         make(chan struct{}, 1),
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
		Error: s.lastError, Peaks: s.peaks, Samples: append([]Sample{}, s.samples...),
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
	s.previous = &snapshot
	s.latest = &snapshot
	sample := Sample{
		CapturedAt: snapshot.CapturedAt, ElapsedMillis: snapshot.ElapsedMillis, IntervalMillis: interval,
		PrivateBytes: snapshot.Main.PrivateBytes, HeapBytes: snapshot.Go.HeapBytes,
		CPUPercent: snapshot.Main.CPUPercent, PagedPoolBytes: snapshot.System.PagedPoolBytes,
		NonpagedPoolBytes: snapshot.System.NonpagedPoolBytes,
	}
	s.sampleCount++
	s.samples = appendSample(s.samples, sample)
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

// Rule: 超过上限时对中间样本做一次减半降采样：首样本（启动基线）与最新样本（当前值）始终保持原始值，
// 中间样本两两合并，内存量取平均，CPU 按区间时长加权，时间戳取较新值；样本数随即减半，覆盖时长随运行期翻倍。
func appendSample(samples []Sample, sample Sample) []Sample {
	next := append(append([]Sample{}, samples...), sample)
	if len(next) <= HistoryLimit {
		return next
	}
	return decimateSamples(next)
}

func decimateSamples(samples []Sample) []Sample {
	merged := []Sample{samples[0]}
	for index := 1; index+1 < len(samples)-1; index += 2 {
		merged = append(merged, mergeSamples(samples[index], samples[index+1]))
	}
	if (len(samples)-2)%2 == 1 {
		merged = append(merged, samples[len(samples)-2])
	}
	return append(merged, samples[len(samples)-1])
}

func mergeSamples(older, newer Sample) Sample {
	merged := Sample{
		CapturedAt:        newer.CapturedAt,
		ElapsedMillis:     newer.ElapsedMillis,
		IntervalMillis:    older.IntervalMillis + newer.IntervalMillis,
		PrivateBytes:      averageBytes(older.PrivateBytes, newer.PrivateBytes),
		HeapBytes:         (older.HeapBytes + newer.HeapBytes) / 2,
		PagedPoolBytes:    (older.PagedPoolBytes + newer.PagedPoolBytes) / 2,
		NonpagedPoolBytes: (older.NonpagedPoolBytes + newer.NonpagedPoolBytes) / 2,
	}
	if merged.IntervalMillis > 0 && older.CPUPercent != nil && newer.CPUPercent != nil {
		percent := (*older.CPUPercent*float64(older.IntervalMillis) + *newer.CPUPercent*float64(newer.IntervalMillis)) / float64(merged.IntervalMillis)
		merged.CPUPercent = &percent
	} else if newer.CPUPercent != nil {
		merged.CPUPercent = newer.CPUPercent
	} else {
		merged.CPUPercent = older.CPUPercent
	}
	return merged
}

func averageBytes(left, right *uint64) *uint64 {
	if left == nil {
		return right
	}
	if right == nil {
		return left
	}
	average := *left/2 + *right/2
	return &average
}
