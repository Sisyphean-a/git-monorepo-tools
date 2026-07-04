package main

import (
	"strings"
	"testing"
	"time"
)

func TestTerminalOutputBatcherFlushesOnSizeThreshold(t *testing.T) {
	var chunks []string
	batcher := newTerminalOutputBatcherWithConfig("term-1", func(_ string, payload any) {
		event := payload.(terminalOutputEvent)
		chunks = append(chunks, event.Chunk)
	}, time.Hour, 12)

	batcher.Add("abc")
	batcher.Add("def")
	batcher.Add("ghi")
	batcher.Add("jkl")
	batcher.Close()

	if len(chunks) != 1 {
		t.Fatalf("expected one emitted chunk, got %d", len(chunks))
	}
	if chunks[0] != "abcdefghijkl" {
		t.Fatalf("unexpected payload %q", chunks[0])
	}
}

func TestTerminalOutputBatcherFlushesOnTimer(t *testing.T) {
	var chunks []string
	batcher := newTerminalOutputBatcherWithConfig("term-1", func(_ string, payload any) {
		event := payload.(terminalOutputEvent)
		chunks = append(chunks, event.Chunk)
	}, 10*time.Millisecond, 1024)

	batcher.Add("hello")
	time.Sleep(40 * time.Millisecond)
	batcher.Close()

	if len(chunks) != 1 {
		t.Fatalf("expected one emitted chunk after timer flush, got %d", len(chunks))
	}
	if chunks[0] != "hello" {
		t.Fatalf("unexpected payload %q", chunks[0])
	}
}

func TestTerminalOutputBatcherPressureCollapsesManyChunks(t *testing.T) {
	emits := 0
	var payload strings.Builder
	batcher := newTerminalOutputBatcherWithConfig("term-1", func(_ string, event any) {
		emits++
		payload.WriteString(event.(terminalOutputEvent).Chunk)
	}, time.Hour, 64*1024)

	for i := 0; i < 4096; i++ {
		batcher.Add("0123456789abcdef")
	}
	batcher.Close()

	if emits > 2 {
		t.Fatalf("expected heavy burst to collapse into at most 2 emits, got %d", emits)
	}
	if payload.Len() != 4096*16 {
		t.Fatalf("unexpected payload length %d", payload.Len())
	}
}

func BenchmarkTerminalOutputBatcherBurst(b *testing.B) {
	chunks := make([]string, 4096)
	for i := range chunks {
		chunks[i] = "0123456789abcdef"
	}

	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		batcher := newTerminalOutputBatcherWithConfig("term-1", func(string, any) {}, time.Hour, 64*1024)
		for _, chunk := range chunks {
			batcher.Add(chunk)
		}
		batcher.Close()
	}
}
