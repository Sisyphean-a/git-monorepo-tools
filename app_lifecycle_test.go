package main

import (
	"context"
	"runtime"
	"testing"
	"time"

	"git-monorepo-tools/internal/terminal"
	"git-monorepo-tools/snapshot"
)

type lifecycleWorkspace struct {
	workspaceService
	closed        bool
	repoID        string
	browserActive bool
}

func (workspace *lifecycleWorkspace) SetReadActivity(repoID string, browserActive bool) {
	workspace.repoID, workspace.browserActive = repoID, browserActive
}
func (*lifecycleWorkspace) CleanupReadResources()  {}
func (workspace *lifecycleWorkspace) Close() error { workspace.closed = true; return nil }

func TestAppReadLifecycleAndShutdownStopsMaintenance(t *testing.T) {
	workspace := &lifecycleWorkspace{}
	app := newApp(workspace, nil)
	app.startup(context.Background())
	app.SetReadActivity("repo", true)
	if workspace.repoID != "repo" || !workspace.browserActive {
		t.Fatal("read activity was not forwarded")
	}
	app.shutdown(context.Background())
	if !workspace.closed {
		t.Fatal("shutdown did not release workspace resources")
	}
	select {
	case <-app.maintenanceDone:
	default:
		t.Fatal("cleanup goroutine was left running after shutdown")
	}
}

func TestAppMaintenanceStopsWhenRuntimeContextEnds(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	app := newApp(&lifecycleWorkspace{}, nil)
	app.startup(ctx)
	cancel()
	select {
	case <-app.maintenanceDone:
	case <-time.After(time.Second):
		t.Fatal("maintenance ignored runtime cancellation")
	}
	app.shutdown(context.Background())
}

func TestAppResourceMonitorSamplesFromStartupToShutdown(t *testing.T) {
	app := newApp(&lifecycleWorkspace{}, nil)
	app.startup(context.Background())
	stopped := false
	defer func() {
		if !stopped {
			app.shutdown(context.Background())
		}
	}()
	deadline := time.Now().Add(2 * time.Second)
	state, err := app.GetResourceMonitorState()
	if err != nil {
		t.Fatal(err)
	}
	for state.Snapshot == nil || state.SampleCount == 0 {
		if time.Now().After(deadline) {
			t.Fatalf("no sample after startup: %+v", state)
		}
		time.Sleep(10 * time.Millisecond)
		if state, err = app.GetResourceMonitorState(); err != nil {
			t.Fatal(err)
		}
	}
	if state.StartedAt == 0 || len(state.Samples) == 0 {
		t.Fatalf("missing launch baseline: %+v", state)
	}
	launch := state
	if !state.Live {
		t.Fatal("state reads must keep the panel observation window active")
	}
	// Guarantee: 面板关闭只降低采样频率，启动基线与本次会话历史都保留；首点是启动基线所在的桶，时间戳取桶内最新样本。
	app.monitor.SetLive(false)
	closed := app.monitor.State()
	if closed.Live || closed.StartedAt != launch.StartedAt || len(closed.Samples) < len(launch.Samples) ||
		closed.Samples[0].ElapsedMillis < launch.Samples[0].ElapsedMillis ||
		closed.Samples[len(closed.Samples)-1].ElapsedMillis < launch.Samples[len(launch.Samples)-1].ElapsedMillis {
		t.Fatalf("panel close dropped session history: %+v", closed)
	}
	// Guarantee: 重新打开面板时，下一次状态读取会激活观察窗口并立即采样，不必等到下一个后台周期。
	revision := closed.Revision
	deadline = time.Now().Add(2 * time.Second)
	state = closed
	for state.Revision <= revision {
		if time.Now().After(deadline) {
			t.Fatalf("reopening the panel did not trigger a fresh observation sample: %+v", state)
		}
		time.Sleep(10 * time.Millisecond)
		if state, err = app.GetResourceMonitorState(); err != nil {
			t.Fatal(err)
		}
	}
	if !state.Live {
		t.Fatal("reopened panel must return to the live cadence")
	}
	if state.Snapshot == nil || state.Snapshot.Children == nil || state.Snapshot.Terminals == nil {
		t.Fatal("live observation must include the process tree, even when it is empty")
	}
	app.shutdown(context.Background())
	stopped = true
	// Guarantee: 关闭后采样循环停止，状态不再推进。
	frozen := app.monitor.State()
	time.Sleep(50 * time.Millisecond)
	after := app.monitor.State()
	if after.Revision != frozen.Revision {
		t.Fatalf("sampler kept running after shutdown: %d -> %d", frozen.Revision, after.Revision)
	}
}

type resourceTerminalGateway struct {
	terminalGateway
}

func (resourceTerminalGateway) ResourceSessions() []terminal.ResourceSession {
	return []terminal.ResourceSession{{Info: terminal.TerminalSessionInfo{SessionID: "a", RepoID: "project", RepoPath: "E:/project", Shell: "pwsh", StartedAt: 1}, Root: terminal.ProcessIdentity{PID: 999999, CreatedAt: 2}, Error: "成员查询失败"}}
}

func TestAppConnectsTerminalOwnershipToLiveResourceSnapshot(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("原生资源采样仅支持 Windows")
	}
	app := newApp(&lifecycleWorkspace{}, nil)
	app.terminals = resourceTerminalGateway{}
	app.monitor.SetLive(true)
	app.monitor.Start()
	defer app.monitor.Stop()
	deadline := time.Now().Add(2 * time.Second)
	for {
		state, err := app.GetResourceMonitorState()
		if err != nil {
			t.Fatal(err)
		}
		if state.Snapshot != nil {
			if len(state.Snapshot.Terminals) != 1 {
				t.Fatal("terminal provider was not wired into the sampler")
			}
			scope := state.Snapshot.Terminals[0]
			if scope.SessionID != "a" || scope.RepoID != "project" || scope.RepoPath != "E:/project" || scope.RootPID != 999999 || scope.RootCreatedAt != 2 || scope.Error != "成员查询失败" {
				t.Fatal("the composition root lost terminal attribution fields or its failure")
			}
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("live sample did not arrive")
		}
		time.Sleep(time.Millisecond)
	}
}

func TestAppBackgroundTasksAreAppOwnedAndReclaimedOnShutdown(t *testing.T) {
	workspace := &lifecycleWorkspace{}
	app := newApp(workspace, nil)
	t.Cleanup(func() { app.shutdown(context.Background()) })
	command := "printf READY; sleep 600"
	if runtime.GOOS == "windows" {
		command = "Write-Output READY; Start-Sleep -Seconds 600"
	}
	request := snapshot.BackgroundTaskRequest{TaskID: "dev", RepoID: "A", RepoName: "A", RepoPath: t.TempDir(), Name: "开发", Command: command, WorkDir: "."}
	state, err := app.StartBackgroundTask(request)
	if err != nil {
		t.Fatal(err)
	}
	if len(app.ListBackgroundTasks()) != 1 {
		t.Fatal("task was not registered")
	}
	if _, err := app.ReadBackgroundTaskLog("A", "dev", state.RunID, -1); err != nil {
		t.Fatal(err)
	}
	if err := app.ForgetBackgroundTask("A", "dev"); err == nil {
		t.Fatal("forgot a running task")
	}
	if err := app.StopBackgroundTask("missing", "dev"); err == nil {
		t.Fatal("unknown stop succeeded")
	}
	app.shutdown(context.Background())
	if !workspace.closed || len(app.ListBackgroundTasks()) != 0 {
		t.Fatal("shutdown left app resources alive")
	}
	if _, err := app.StartBackgroundTask(request); err == nil {
		t.Fatal("started task after shutdown")
	}
}

func TestAppResourceMonitorWithoutSamplerFailsLoudly(t *testing.T) {
	app := &App{}
	if _, err := app.GetResourceMonitorState(); err == nil {
		t.Fatal("state must not pretend to succeed without a sampler")
	}
}
