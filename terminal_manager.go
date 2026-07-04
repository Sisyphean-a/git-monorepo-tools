package main

import (
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

type terminalEmitter func(name string, payload any)

type terminalHost interface {
	io.ReadWriteCloser
	Kill() error
	Resize(cols, rows int) error
	Wait() (int, error)
}

type terminalManager struct {
	emit terminalEmitter

	mu           sync.RWMutex
	sessionsByID map[string]*terminalSession
}

type terminalSession struct {
	id        string
	repoID    string
	repoPath  string
	repoInfo  os.FileInfo
	shell     string
	startedAt int64
	host      terminalHost
	emit      terminalEmitter
	onExit    func(*terminalSession)

	writeMu  sync.Mutex
	waitMu   sync.Mutex
	waitDone chan struct{}

	waitExitCode int
	waitErr      error
	closeOnce    sync.Once
}

func newTerminalManager(emit terminalEmitter) *terminalManager {
	return &terminalManager{
		emit:         emit,
		sessionsByID: map[string]*terminalSession{},
	}
}

func (m *terminalManager) EnsureSession(request TerminalSessionRequest) (TerminalSessionInfo, error) {
	repoPath, repoInfo, err := validateTerminalRepoPath(request.RepoPath)
	if err != nil {
		return TerminalSessionInfo{}, err
	}

	cols, rows := normalizeTerminalSize(request.Cols, request.Rows)
	repoID := strings.TrimSpace(request.RepoID)

	m.mu.Lock()
	existing := m.sessionForRepoLocked(repoPath, repoInfo)
	if existing != nil {
		m.mu.Unlock()
		_ = existing.Resize(cols, rows)
		return existing.info(), nil
	}

	host, shell, err := newTerminalHost(repoPath, cols, rows)
	if err != nil {
		m.mu.Unlock()
		return TerminalSessionInfo{}, err
	}

	session := &terminalSession{
		id:        fmt.Sprintf("term-%d", time.Now().UnixNano()),
		repoID:    repoID,
		repoPath:  repoPath,
		repoInfo:  repoInfo,
		shell:     shell,
		startedAt: time.Now().UnixMilli(),
		host:      host,
		emit:      m.emit,
		waitDone:  make(chan struct{}),
	}
	session.onExit = m.handleExit

	m.sessionsByID[session.id] = session
	m.mu.Unlock()

	session.start()
	return session.info(), nil
}

func (m *terminalManager) WriteInput(sessionID, data string) error {
	session, err := m.sessionByID(sessionID)
	if err != nil {
		return err
	}
	return session.WriteInput(data)
}

func (m *terminalManager) Resize(sessionID string, cols, rows int) error {
	session, err := m.sessionByID(sessionID)
	if err != nil {
		return err
	}
	return session.Resize(cols, rows)
}

func (m *terminalManager) CloseAll() {
	m.mu.RLock()
	sessions := make([]*terminalSession, 0, len(m.sessionsByID))
	for _, session := range m.sessionsByID {
		sessions = append(sessions, session)
	}
	m.mu.RUnlock()

	for _, session := range sessions {
		session.Stop()
	}
}

func (m *terminalManager) sessionByID(sessionID string) (*terminalSession, error) {
	sessionID = strings.TrimSpace(sessionID)
	if sessionID == "" {
		return nil, errors.New("缺少终端会话 ID")
	}

	m.mu.RLock()
	session := m.sessionsByID[sessionID]
	m.mu.RUnlock()
	if session == nil {
		return nil, errors.New("终端会话不存在")
	}
	return session, nil
}

func (m *terminalManager) handleExit(session *terminalSession) {
	m.mu.Lock()
	delete(m.sessionsByID, session.id)
	m.mu.Unlock()
}

func (m *terminalManager) sessionForRepoLocked(repoPath string, repoInfo os.FileInfo) *terminalSession {
	for _, session := range m.sessionsByID {
		if sameTerminalRepo(session.repoPath, session.repoInfo, repoPath, repoInfo) {
			return session
		}
	}
	return nil
}

func (s *terminalSession) info() TerminalSessionInfo {
	return TerminalSessionInfo{
		SessionID: s.id,
		RepoID:    s.repoID,
		RepoPath:  s.repoPath,
		Shell:     s.shell,
		StartedAt: s.startedAt,
	}
}

func (s *terminalSession) start() {
	go s.waitForExit()
	go s.streamOutput()
}

func (s *terminalSession) Stop() {
	_ = s.host.Kill()
	_ = s.host.Close()
}

func (s *terminalSession) WriteInput(data string) error {
	if data == "" {
		return nil
	}
	select {
	case <-s.waitDone:
		return errors.New("终端会话已结束")
	default:
	}

	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	_, err := s.host.Write([]byte(data))
	return err
}

func (s *terminalSession) Resize(cols, rows int) error {
	select {
	case <-s.waitDone:
		return nil
	default:
	}
	cols, rows = normalizeTerminalSize(cols, rows)
	return s.host.Resize(cols, rows)
}

func (s *terminalSession) streamOutput() {
	buffer := make([]byte, 32*1024)
	for {
		readBytes, err := s.host.Read(buffer)
		if readBytes > 0 {
			s.emit(terminalOutputEventName, terminalOutputEvent{
				SessionID: s.id,
				Chunk:     string(buffer[:readBytes]),
			})
		}
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			break
		}
	}

	<-s.waitDone
	s.finish()
}

func (s *terminalSession) waitForExit() {
	exitCode, err := s.host.Wait()
	s.waitMu.Lock()
	s.waitExitCode = exitCode
	s.waitErr = err
	s.waitMu.Unlock()
	close(s.waitDone)
}

func (s *terminalSession) finish() {
	s.closeOnce.Do(func() {
		_ = s.host.Close()
		exitCode, waitErr := s.waitResult()
		if waitErr != nil && exitCode == 0 {
			exitCode = -1
		}
		s.emit(terminalExitEventName, terminalExitEvent{
			SessionID: s.id,
			ExitCode:  exitCode,
		})
		if s.onExit != nil {
			s.onExit(s)
		}
	})
}

func (s *terminalSession) waitResult() (int, error) {
	s.waitMu.Lock()
	defer s.waitMu.Unlock()
	return s.waitExitCode, s.waitErr
}

func validateTerminalRepoPath(repoPath string) (string, os.FileInfo, error) {
	trimmed := strings.TrimSpace(repoPath)
	if trimmed == "" {
		return "", nil, errors.New("缺少仓库路径")
	}

	absolute, err := filepath.Abs(trimmed)
	if err != nil {
		return "", nil, err
	}
	info, err := os.Stat(absolute)
	if err != nil {
		return "", nil, err
	}
	if !info.IsDir() {
		return "", nil, errors.New("终端目标不是目录")
	}
	return absolute, info, nil
}
