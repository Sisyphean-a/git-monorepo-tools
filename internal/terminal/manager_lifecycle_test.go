package terminal

import (
	"bytes"
	"io"
	"strconv"
	"sync"
	"testing"
)

type scriptedTerminalHost struct {
	reader      *bytes.Reader
	waitStarted chan struct{}
	waitResult  chan scriptedTerminalWaitResult
	closeOnce   sync.Once
}

type scriptedTerminalWaitResult struct {
	exitCode int
	err      error
}

func newScriptedTerminalHost(output string) *scriptedTerminalHost {
	return &scriptedTerminalHost{
		reader:      bytes.NewReader([]byte(output)),
		waitStarted: make(chan struct{}, 1),
		waitResult:  make(chan scriptedTerminalWaitResult, 1),
	}
}

func (h *scriptedTerminalHost) Read(buffer []byte) (int, error) {
	return h.reader.Read(buffer)
}

func (h *scriptedTerminalHost) Write(data []byte) (int, error) {
	return len(data), nil
}

func (h *scriptedTerminalHost) Close() error {
	h.closeOnce.Do(func() {})
	return nil
}

func (h *scriptedTerminalHost) Kill() error {
	return nil
}

func (h *scriptedTerminalHost) Resize(int, int) error {
	return nil
}

func (h *scriptedTerminalHost) Wait() (int, error) {
	h.waitStarted <- struct{}{}
	result := <-h.waitResult
	return result.exitCode, result.err
}

func TestTerminalSessionFlushesStartupOutputBeforeExitAndCleansManager(t *testing.T) {
	host := newScriptedTerminalHost("\x1b[?2004h\x1b[>1u")
	var (
		mu     sync.Mutex
		events []string
	)
	finished := make(chan struct{})
	manager := NewManager(func(name string, payload any) {
		mu.Lock()
		defer mu.Unlock()
		switch event := payload.(type) {
		case terminalOutputEvent:
			if name == terminalOutputEventName {
				events = append(events, "output:"+event.Chunk)
			}
		case terminalExitEvent:
			if name == terminalExitEventName {
				events = append(events, "exit:"+strconv.Itoa(event.ExitCode))
			}
		}
	})
	session := &terminalSession{
		id:       "term-scripted",
		host:     host,
		emit:     manager.emit,
		waitDone: make(chan struct{}),
	}
	session.onExit = func(exited *terminalSession) {
		manager.handleExit(exited)
		close(finished)
	}
	manager.sessionsByID[session.id] = session

	session.start()
	<-host.waitStarted
	host.waitResult <- scriptedTerminalWaitResult{exitCode: 7}
	<-finished

	mu.Lock()
	defer mu.Unlock()
	if len(events) != 2 {
		t.Fatalf("expected startup output and exit, got %#v", events)
	}
	if events[0] != "output:\x1b[?2004h\x1b[>1u" {
		t.Fatalf("startup output must be delivered verbatim before exit, got %#v", events)
	}
	if events[1] != "exit:7" {
		t.Fatalf("unexpected exit event order %#v", events)
	}
	if _, err := manager.sessionByID(session.id); err == nil {
		t.Fatal("exited session must be removed before another session can reuse it")
	}
}

var _ terminalHost = (*scriptedTerminalHost)(nil)
var _ io.ReadWriteCloser = (*scriptedTerminalHost)(nil)
