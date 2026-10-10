package monitor

import (
	"os"
	"strings"
	"testing"

	"golang.org/x/sys/windows"
)

func TestRuntimeLabelsOnlyIdentifyEntrypointsAndNeverExposeArguments(t *testing.T) {
	for _, item := range []struct {
		args []string
		want string
	}{
		{[]string{"node.exe", `C:\nvm\node_modules\@earendil-works\pi-coding-agent\dist\bundle\cli.js`, "--api-key", "SECRET"}, "Pi"},
		{[]string{"node.exe", `C:\x\node_modules\@colbymchenry\codegraph\npm-shim.js`, "serve", "--mcp"}, "Codegraph"},
		{[]string{"bun.exe", "run", `C:\x\node_modules\context-mode\server.bundle.mjs`}, "context-mode"},
		{[]string{"node.exe", `E:\repo\node_modules\typescript\lib\tsserver.js`}, "TypeScript 语言服务"},
		{[]string{"node.exe", `C:\app\ordinary.js`, `C:\x\node_modules\context-mode\secret.js`}, ""},
		{[]string{"node.exe", "--eval", "process.env.SECRET"}, ""},
		{[]string{"node.exe", "--require", `C:\x\node_modules\context-mode\preload.js`, "ordinary.js"}, ""},
		{[]string{"node.exe", "--eval", `C:\x\node_modules\context-mode\secret`}, ""},
		{[]string{"node.exe", "run", `C:\x\node_modules\context-mode\secret.js`}, ""},
		{nil, ""},
	} {
		if got := runtimeProcessLabel(item.args); got != item.want || strings.Contains(got, "SECRET") {
			t.Fatalf("entrypoint label mismatch: got %q want %q", got, item.want)
		}
	}
}

func TestNativeCommandLineReadKeepsRawArgumentsOutOfLabels(t *testing.T) {
	commandLine, err := readProcessCommandLine(windows.CurrentProcess())
	if err != nil {
		t.Fatal(err)
	}
	if commandLine == "" {
		t.Fatal("native command-line query returned no data for the test process")
	}
	label, failure := processLabel(windows.CurrentProcess(), "node.exe")
	if label != "" || failure != "" {
		t.Fatalf("an unknown entrypoint must retain the process name, not expose its command line: label=%q failure=%q", label, failure)
	}
}

func TestSamplerOnlyReadsTerminalScopesDuringLiveSampling(t *testing.T) {
	calls := 0
	sampler := NewSampler(func() []TerminalScope { calls++; return []TerminalScope{} })
	sampler.sampleOnce()
	if calls != 0 || sampler.State().Snapshot.Terminals != nil {
		t.Fatal("background digest must not query Jobs or claim to have collected terminal metadata")
	}
	sampler.SetLive(true)
	sampler.sampleOnce()
	if calls != 1 || sampler.State().Snapshot.Terminals == nil {
		t.Fatal("live sampling must distinguish collected empty sessions from uncollected attribution")
	}
}

func TestSnapshotSupplementsVerifiedMembersOutsideCurrentAncestry(t *testing.T) {
	// Rule: 以已知存活的测试父进程模拟经 Job 验证、但无法沿当前父链找到的成员；不创建或操作任何用户进程。
	identity, err := readProcess(processIdentity{pid: uint32(os.Getppid()), name: "test-parent"})
	if err != nil {
		t.Fatal(err)
	}
	terminal := TerminalScope{SessionID: "a", Members: []ProcessIdentity{{PID: identity.PID, CreatedAt: identity.CreatedAt}}}
	snapshot, err := readSnapshot(true, []TerminalScope{terminal})
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, process := range snapshot.Children {
		if process.PID == identity.PID {
			found = true
			if process.TerminalSessionID != "a" {
				t.Fatal("verified Job member lost its session attribution")
			}
		}
	}
	if !found {
		t.Fatal("a verified member outside the current root's ancestry was omitted")
	}
	terminal.Members[0].CreatedAt--
	snapshot, err = readSnapshot(true, []TerminalScope{terminal})
	if err != nil {
		t.Fatal(err)
	}
	for _, process := range snapshot.Children {
		if process.PID == identity.PID {
			t.Fatal("a stale member identity must not pull a reused PID into the snapshot")
		}
	}
}
