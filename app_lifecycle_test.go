package main

import (
	"context"
	"testing"
	"time"
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
