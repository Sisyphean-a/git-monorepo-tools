package monitor

import (
	"encoding/json"
	"math"
	"strings"
	"testing"
	"unsafe"
)

func poolTagBuffer(entries ...poolTag) []byte {
	offset, stride := int(unsafe.Offsetof(poolTagInformation{}.First)), int(unsafe.Sizeof(poolTag{}))
	buffer := make([]byte, offset+len(entries)*stride)
	*(*uint32)(unsafe.Pointer(&buffer[0])) = uint32(len(entries))
	for index, entry := range entries {
		copy(buffer[offset+index*stride:], unsafe.Slice((*byte)(unsafe.Pointer(&entry)), stride))
	}
	return buffer
}

func TestFilePoolNativeLayout(t *testing.T) {
	size, offset := uintptr(40), uintptr(8)
	if unsafe.Sizeof(uintptr(0)) == 4 {
		size, offset = 28, 4
	}
	if unsafe.Sizeof(poolTag{}) != size || unsafe.Offsetof(poolTagInformation{}.First) != offset {
		t.Fatal("SYSTEM_POOLTAG_INFORMATION ABI does not match")
	}
}

func TestFilePoolReadsNativeSystemCounters(t *testing.T) {
	snapshot, err := ReadSnapshot(false)
	if err != nil {
		t.Fatal(err)
	}
	file := snapshot.System.FilePool
	if file == nil || snapshot.System.FilePoolError != "" {
		t.Fatalf("native File query failed: %s", snapshot.System.FilePoolError)
	}
	if file.Count == 0 || file.Bytes == 0 || file.NetPerSecond != nil {
		t.Fatalf("invalid native counters or fabricated first-sample rate: %+v", file)
	}
	t.Logf("File outstanding=%d bytes=%d", file.Count, file.Bytes)
}

func TestFilePoolParsingIncludesBothPoolsAndCounterRollover(t *testing.T) {
	buffer := poolTagBuffer(
		poolTag{Tag: [4]byte{'T', 'e', 's', 't'}, NonpagedAllocs: 999, NonpagedUsed: 999},
		poolTag{Tag: [4]byte{'F', 'i', 'l', 'e'}, PagedAllocs: 12, PagedFrees: 2, PagedUsed: 100,
			NonpagedAllocs: 10, NonpagedFrees: ^uint32(0) - 19, NonpagedUsed: 12_000},
	)
	file, err := parseFilePool(buffer)
	if err != nil {
		t.Fatal(err)
	}
	if file.Count != 40 || file.Bytes != 12_100 || file.NetPerSecond != nil {
		t.Fatalf("incorrect tag accounting across ULONG rollover: %+v", file)
	}
	zero, err := parseFilePool(poolTagBuffer(poolTag{Tag: [4]byte{'F', 'i', 'l', 'e'}}))
	if err != nil || zero == nil || zero.Count != 0 || zero.Bytes != 0 {
		t.Fatalf("measured zero must differ from a missing tag: %+v, %v", zero, err)
	}
}

func TestFilePoolParsingRejectsMissingAndIncompleteData(t *testing.T) {
	valid := poolTagBuffer(poolTag{Tag: [4]byte{'F', 'i', 'l', 'e'}})
	invalidCount := poolTagBuffer()
	*(*uint32)(unsafe.Pointer(&invalidCount[0])) = ^uint32(0)
	for name, buffer := range map[string][]byte{
		"header": nil,
		"entry":  valid[:len(valid)-1],
		"count":  invalidCount,
		"absent": poolTagBuffer(poolTag{Tag: [4]byte{'T', 'e', 's', 't'}}),
	} {
		t.Run(name, func(t *testing.T) {
			file, err := parseFilePool(buffer)
			if err == nil || file != nil {
				t.Fatalf("invalid or absent File data must stay unknown: %+v, %v", file, err)
			}
		})
	}
}

func TestFilePoolSamplerUsesActualIntervalsAndResetsAfterPartialFailure(t *testing.T) {
	sampler := NewSampler(nil)
	times := []uint64{30_000, 60_000, 90_000, 150_000, 180_000}
	counts := []*uint64{pointer(uint64(100)), nil, pointer(uint64(150)), pointer(uint64(200)), pointer(uint64(100))}
	index := 0
	sampler.read = func(bool) (Snapshot, error) {
		snapshot := Snapshot{ElapsedMillis: times[index], System: SystemMemory{NonpagedPoolBytes: 1_000}}
		if count := counts[index]; count != nil {
			snapshot.System.FilePool = &FilePool{Count: *count, Bytes: *count * 400}
		} else {
			snapshot.System.FilePoolError = "NTSTATUS 0xC0000022"
		}
		index++
		return snapshot, nil
	}
	for range times {
		sampler.sampleOnce()
		state := sampler.State()
		last := state.Samples[len(state.Samples)-1]
		if state.Error != "" || state.Snapshot.System.NonpagedPoolBytes != 1_000 {
			t.Fatal("File failure must not hide other successful measurements")
		}
		if index == 2 {
			if state.Snapshot.System.FilePool != nil || state.Snapshot.System.FilePoolError == "" || last.FilePoolCount != nil || last.FilePoolBytes != nil {
				t.Fatal("partial failure must publish an error and null File counters")
			}
			encoded, err := json.Marshal(state)
			if err != nil || !strings.Contains(string(encoded), `"filePool":null`) || !strings.Contains(string(encoded), `"filePoolCount":null`) {
				t.Fatalf("unknown File counters must stay null across the bridge: %s, %v", encoded, err)
			}
			continue
		}
		file := state.Snapshot.System.FilePool
		// 每个样本独占一个时间桶时，历史点仍是该桶内按覆盖时长加权的平均值。
		if last.FilePoolCount == nil || *last.FilePoolCount != file.Count || last.FilePoolBytes == nil || *last.FilePoolBytes != file.Bytes {
			t.Fatal("history must retain File counters")
		}
		if index <= 3 {
			if file.NetPerSecond != nil {
				t.Fatal("first sample or interrupted File query must have no rate")
			}
		} else {
			want := 50.0 / 60
			if index == 5 {
				want = -100.0 / 30
			}
			if file.NetPerSecond == nil || math.Abs(*file.NetPerSecond-want) > 1e-9 {
				t.Fatalf("rate must use actual monotonic seconds, got %v, want %v", file.NetPerSecond, want)
			}
		}
	}
	previous := sampler.State().Snapshot
	for _, elapsed := range []uint64{previous.ElapsedMillis, previous.ElapsedMillis - 1} {
		next := Snapshot{ElapsedMillis: elapsed, System: SystemMemory{FilePool: &FilePool{Count: 999}}}
		attachFilePoolRate(&next, previous)
		if next.System.FilePool.NetPerSecond != nil {
			t.Fatal("non-increasing time must not fabricate a rate")
		}
	}
}

func TestFilePoolHistoryKeepsUnknownsAndWeightsKnownSamples(t *testing.T) {
	history := newHistory()
	step := history.width
	for index := range HistoryLimit * 20 {
		// 全部样本取同一数值：分桶与重分桶都必须原样保持，不得漂移。
		history.add(Sample{ElapsedMillis: uint64(index) * step, IntervalMillis: step, FilePoolCount: pointer(uint64(1_000)), FilePoolBytes: pointer(uint64(400_000))})
	}
	samples := history.samples()
	if len(samples) > HistoryLimit {
		t.Fatal("File history exceeded its existing bound")
	}
	for index, sample := range samples {
		if sample.FilePoolCount == nil || *sample.FilePoolCount != 1_000 || sample.FilePoolBytes == nil || *sample.FilePoolBytes != 400_000 {
			t.Fatalf("identical File values must survive bucketing at %d: %+v", index, sample)
		}
	}
	// Rule: 未知样本不参与平均，也不占用时长权重；只有全部未知时历史点保持 null。
	mixed := newBucket(Sample{IntervalMillis: 1_000, FilePoolCount: pointer(uint64(100)), FilePoolBytes: pointer(uint64(40_000))})
	mixed = mergeBuckets(mixed, newBucket(Sample{ElapsedMillis: 1_000, IntervalMillis: 1_000}))
	if sample := mixed.sample(); sample.FilePoolCount == nil || *sample.FilePoolCount != 100 || sample.FilePoolBytes == nil || *sample.FilePoolBytes != 40_000 {
		t.Fatalf("unknown File data must not dilute the average: %+v", sample)
	}
	if unknown := newBucket(Sample{}).sample(); unknown.FilePoolCount != nil || unknown.FilePoolBytes != nil {
		t.Fatal("bucketing must not turn unknown File data into zero")
	}
	// Guarantee: 饱和的累计计数不得回绕。
	saturated := newBucket(Sample{IntervalMillis: 1_000, FilePoolCount: pointer(^uint64(0))})
	saturated = mergeBuckets(saturated, newBucket(Sample{ElapsedMillis: 1_000, IntervalMillis: 1_000, FilePoolCount: pointer(^uint64(0))}))
	if value := saturated.sample().FilePoolCount; value == nil || *value != ^uint64(0) {
		t.Fatalf("saturated counters must not wrap: %v", value)
	}
}
