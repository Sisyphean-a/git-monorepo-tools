package terminal

import "sort"

type ProcessIdentity struct {
	PID       uint32
	CreatedAt int64
}

type ResourceSession struct {
	Info    TerminalSessionInfo
	Root    ProcessIdentity
	Members []ProcessIdentity
	Error   string
}

// Flow: 只在资源面板采样时读取会话及其 Job 成员；管理器锁只用于复制会话引用，原生查询不阻塞会话增删。
func (m *Manager) ResourceSessions() []ResourceSession {
	m.mu.RLock()
	sessions := make([]*terminalSession, 0, len(m.sessionsByID))
	for _, session := range m.sessionsByID {
		sessions = append(sessions, session)
	}
	m.mu.RUnlock()
	sort.Slice(sessions, func(i, j int) bool {
		return sessions[i].startedAt < sessions[j].startedAt || sessions[i].startedAt == sessions[j].startedAt && sessions[i].id < sessions[j].id
	})
	result := make([]ResourceSession, 0, len(sessions))
	for _, session := range sessions {
		root, members, err := session.host.ResourceProcesses()
		item := ResourceSession{Info: session.info(), Root: root, Members: members}
		if err != nil {
			item.Error = err.Error()
		}
		result = append(result, item)
	}
	return result
}
