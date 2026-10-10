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
	times := []uint64{1_000, 6_000, 11_000, 14_000, 16_000}
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
		if last.FilePoolCount == nil || *last.FilePoolCount != file.Count || last.FilePoolBytes == nil || *last.FilePoolBytes != file.Bytes {
			t.Fatal("history must retain raw File counters")
		}
		if index <= 3 {
			if file.NetPerSecond != nil {
				t.Fatal("first sample or interrupted File query must have no rate")
			}
		} else {
			want := 50.0 / 3
			if index == 5 {
				want = -50
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

func TestFilePoolHistoryKeepsRawEndpointsDuringDecimation(t *testing.T) {
	samples := []Sample{}
	for index := range HistoryLimit * 20 {
		samples = appendSample(samples, Sample{ElapsedMillis: uint64(index), FilePoolCount: pointer(uint64(index)), FilePoolBytes: pointer(uint64(index * 400))})
	}
	last := samples[len(samples)-1]
	if len(samples) > HistoryLimit || *samples[0].FilePoolCount != 0 || *last.FilePoolCount != HistoryLimit*20-1 || *last.FilePoolBytes != (HistoryLimit*20-1)*400 {
		t.Fatal("File history lost raw endpoints or exceeded its existing bound")
	}
	merged := mergeSamples(Sample{FilePoolCount: pointer(uint64(100)), FilePoolBytes: pointer(uint64(400))}, Sample{FilePoolCount: pointer(uint64(200)), FilePoolBytes: pointer(uint64(800))})
	if *merged.FilePoolCount != 150 || *merged.FilePoolBytes != 600 {
		t.Fatal("File intermediate samples must average counts and bytes independently")
	}
	for _, values := range [][3]uint64{{1_001, 1_001, 1_001}, {1, 2, 1}, {^uint64(0), ^uint64(0), ^uint64(0)}} {
		merged := mergeSamples(Sample{FilePoolCount: pointer(values[0])}, Sample{FilePoolCount: pointer(values[1])})
		if merged.FilePoolCount == nil || *merged.FilePoolCount != values[2] {
			t.Fatal("averaging File counts must preserve identical odd values and avoid overflow")
		}
	}
	if unknown := mergeSamples(Sample{}, Sample{}); unknown.FilePoolCount != nil || unknown.FilePoolBytes != nil {
		t.Fatal("decimation must not turn unknown File data into zero")
	}
}
