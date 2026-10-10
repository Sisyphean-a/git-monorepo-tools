package terminal

import (
	"errors"
	"testing"
)

type resourceFixtureHost struct {
	*scriptedTerminalHost
	root    ProcessIdentity
	members []ProcessIdentity
	err     error
}

func (h *resourceFixtureHost) ResourceProcesses() (ProcessIdentity, []ProcessIdentity, error) {
	return h.root, append([]ProcessIdentity(nil), h.members...), h.err
}

func TestResourceSessionsKeepProjectAndSessionIdentitySeparate(t *testing.T) {
	manager := NewManager(func(string, any) {})
	for _, id := range []string{"b", "a"} {
		manager.sessionsByID[id] = &terminalSession{id: id, repoID: "repo", repoPath: "E:/repo", shell: "pwsh", startedAt: 1,
			host: &resourceFixtureHost{root: ProcessIdentity{PID: 2, CreatedAt: 3}, members: []ProcessIdentity{{PID: 4, CreatedAt: 5}}}}
	}
	manager.sessionsByID["failed"] = &terminalSession{id: "failed", repoID: "other", repoPath: "E:/other", startedAt: 2,
		host: &resourceFixtureHost{err: errors.New("Job 查询失败")}}
	sessions := manager.ResourceSessions()
	if len(sessions) != 3 || sessions[0].Info.SessionID != "a" || sessions[1].Info.SessionID != "b" {
		t.Fatal("same-project terminals must remain independent and deterministically ordered")
	}
	if sessions[0].Info.RepoID != "repo" || sessions[0].Info.RepoPath != "E:/repo" || sessions[0].Root.PID != 2 || sessions[0].Members[0].CreatedAt != 5 {
		t.Fatal("session metadata lost project ownership or process identity")
	}
	if sessions[2].Error != "Job 查询失败" || sessions[2].Members != nil {
		t.Fatal("membership failure must remain explicit, not become a successfully empty list")
	}
	delete(manager.sessionsByID, "a")
	if len(manager.ResourceSessions()) != 2 {
		t.Fatal("closed sessions must disappear, not accumulate in resource metadata")
	}
}
