package monitor

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestTerminalAttributionRequiresExactIdentityAndRejectsConflicts(t *testing.T) {
	snapshot := Snapshot{
		Terminals: []TerminalScope{
			{SessionID: "a", RootPID: 2, RootCreatedAt: 10, Members: []ProcessIdentity{{PID: 3, CreatedAt: 11}, {PID: 4, CreatedAt: 12}}},
			{SessionID: "b", RootPID: 5, RootCreatedAt: 13, Members: []ProcessIdentity{{PID: 4, CreatedAt: 12}}},
		},
		Children: []Process{{PID: 2, CreatedAt: 10}, {PID: 3, CreatedAt: 99}, {PID: 4, CreatedAt: 12}, {PID: 5, CreatedAt: 13}, {PID: 6}},
	}
	attachTerminalScopes(&snapshot)
	if snapshot.Children[0].TerminalSessionID != "a" || snapshot.Children[3].TerminalSessionID != "b" {
		t.Fatal("terminal roots lost their verified project ownership")
	}
	if snapshot.Children[1].TerminalSessionID != "" || snapshot.Children[4].TerminalSessionID != "" {
		t.Fatal("PID reuse or unknown creation time must not invent ownership")
	}
	if snapshot.Children[2].TerminalSessionID != "" || snapshot.Children[2].AttributionError == "" {
		t.Fatal("conflicting membership must stay unknown with an explicit error")
	}
	if snapshot.Terminals[0].Error == "" || snapshot.Terminals[1].Error == "" {
		t.Fatal("conflicting sessions must not expose complete zero totals")
	}
	data, err := json.Marshal(snapshot)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(data), "Members") || strings.Contains(string(data), `"members"`) {
		t.Fatal("internal Job membership must not duplicate process lists across the bridge")
	}
}

func TestUnknownMemberIdentityMarksTerminalTotalsIncomplete(t *testing.T) {
	snapshot := Snapshot{Terminals: []TerminalScope{{SessionID: "a", RootPID: 2, RootCreatedAt: 1, Members: []ProcessIdentity{{PID: 2, CreatedAt: 1}}}}, Children: []Process{{PID: 2, Error: "拒绝访问"}}}
	attachTerminalScopes(&snapshot)
	if snapshot.Children[0].TerminalSessionID != "" || snapshot.Terminals[0].Error == "" {
		t.Fatal("unknown identity must stay unassigned and mark its candidate terminal incomplete")
	}
}

func TestStateCopiesTerminalMetadataAndMembers(t *testing.T) {
	sampler := NewSampler(nil)
	sampler.latest = &Snapshot{Terminals: []TerminalScope{{SessionID: "a", Members: []ProcessIdentity{{PID: 2, CreatedAt: 1}}}}}
	copy := sampler.State()
	copy.Snapshot.Terminals[0].SessionID = "changed"
	copy.Snapshot.Terminals[0].Members[0].PID = 999
	state := sampler.State()
	if state.Snapshot.Terminals[0].SessionID != "a" || state.Snapshot.Terminals[0].Members[0].PID != 2 {
		t.Fatal("a returned state view must not mutate the sampler's cached attribution")
	}
}
