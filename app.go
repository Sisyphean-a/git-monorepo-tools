package main

import (
	"context"
	"os"

	"git-monorepo-tools/snapshot"
	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

type App struct {
	ctx         context.Context
	projectRoot string
	service     *snapshot.Service
}

func NewApp() (*App, error) {
	root, err := os.Getwd()
	if err != nil {
		return nil, err
	}

	return &App{
		projectRoot: root,
		service:     snapshot.NewService(root),
	}, nil
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

func (a *App) GetSnapshot(request snapshot.Request) (snapshot.AppSnapshot, error) {
	return a.service.BuildAppSnapshot(request)
}

func (a *App) MutateRepo(repoID, action string, request snapshot.Request, body snapshot.RepoActionRequest) (snapshot.AppSnapshot, error) {
	return a.service.MutateRepo(repoID, action, request, body)
}

func (a *App) RunBatch(operation string, request snapshot.Request) (snapshot.BatchResult, error) {
	return a.service.RunBatch(operation, request)
}

func (a *App) GetRepoLog(repoID string, request snapshot.Request) (snapshot.RepoLog, error) {
	return a.service.GetRepoLog(repoID, request)
}

func (a *App) GenerateCommitMessage(repoID string, request snapshot.Request, settings snapshot.AICommitSettings) (string, error) {
	return a.service.GenerateCommitMessage(repoID, request, settings)
}

func (a *App) RunRepoCommand(request snapshot.RepoCommandRequest) (snapshot.RepoCommandResult, error) {
	if request.StreamID == "" {
		return a.service.RunRepoCommand(request)
	}
	return a.service.StreamRepoCommand(request, func(chunk string) {
		wruntime.EventsEmit(a.ctx, "repo-command-output", map[string]string{
			"streamId": request.StreamID,
			"chunk":    chunk,
		})
	})
}
