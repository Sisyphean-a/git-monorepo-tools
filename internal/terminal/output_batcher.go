package terminal

import (
	"bytes"
	"sync"
	"time"
)

type terminalOutputBatcher struct {
	sessionID     string
	emit          Emitter
	flushInterval time.Duration
	maxBatchBytes int

	mu           sync.Mutex
	pending      bytes.Buffer
	pendingBytes int
	timer        *time.Timer
	closed       bool
}

func newTerminalOutputBatcher(sessionID string, emit Emitter) *terminalOutputBatcher {
	return newTerminalOutputBatcherWithConfig(
		sessionID,
		emit,
		defaultTerminalOutputFlushInterval,
		defaultTerminalOutputBatchBytes,
	)
}

func newTerminalOutputBatcherWithConfig(
	sessionID string,
	emit Emitter,
	flushInterval time.Duration,
	maxBatchBytes int,
) *terminalOutputBatcher {
	if flushInterval <= 0 {
		flushInterval = defaultTerminalOutputFlushInterval
	}
	if maxBatchBytes < 1024 {
		maxBatchBytes = defaultTerminalOutputBatchBytes
	}
	return &terminalOutputBatcher{
		sessionID:     sessionID,
		emit:          emit,
		flushInterval: flushInterval,
		maxBatchBytes: maxBatchBytes,
	}
}

func (b *terminalOutputBatcher) Add(chunk string) {
	if chunk == "" {
		return
	}

	payload := ""
	b.mu.Lock()
	if !b.closed {
		b.pending.WriteString(chunk)
		b.pendingBytes += len(chunk)
		if b.pendingBytes >= b.maxBatchBytes {
			if b.timer != nil {
				b.timer.Stop()
				b.timer = nil
			}
			payload = b.flushLocked()
		} else {
			b.ensureTimerLocked()
		}
	}
	b.mu.Unlock()

	b.emitPayload(payload)
}

func (b *terminalOutputBatcher) Close() {
	payload := ""
	b.mu.Lock()
	if !b.closed {
		b.closed = true
		if b.timer != nil {
			b.timer.Stop()
			b.timer = nil
		}
		payload = b.flushLocked()
	}
	b.mu.Unlock()

	b.emitPayload(payload)
}

func (b *terminalOutputBatcher) ensureTimerLocked() {
	if b.timer != nil {
		return
	}
	b.timer = time.AfterFunc(b.flushInterval, b.flushAsync)
}

func (b *terminalOutputBatcher) flushAsync() {
	b.emitPayload(b.takePending())
}

func (b *terminalOutputBatcher) takePending() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.flushLocked()
}

func (b *terminalOutputBatcher) flushLocked() string {
	if b.pending.Len() == 0 {
		return ""
	}
	payload := b.pending.String()
	b.pending.Reset()
	b.pendingBytes = 0
	b.timer = nil
	return payload
}

func (b *terminalOutputBatcher) emitPayload(payload string) {
	if payload == "" {
		return
	}
	b.emit(terminalOutputEventName, terminalOutputEvent{
		SessionID: b.sessionID,
		Chunk:     payload,
	})
}
