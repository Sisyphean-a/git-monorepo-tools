package main

import (
	"context"
	"errors"
	"os"

	"git-monorepo-tools/snapshot"
	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

type App struct {
	ctx         context.Context
	projectRoot string
	service     *snapshot.Service
	terminals   *terminalManager
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
	a.terminals = newTerminalManager(func(name string, payload any) {
		wruntime.EventsEmit(a.ctx, name, payload)
	})
}

func (a *App) shutdown(context.Context) {
	if a.terminals != nil {
		a.terminals.CloseAll()
	}
}

func (a *App) GetSnapshot(request snapshot.Request) (snapshot.AppSnapshot, error) {
	return a.service.BuildAppSnapshot(request)
}

func (a *App) GetWorkspaceBootstrap(request snapshot.Request) (snapshot.WorkspaceBootstrap, error) {
	return a.service.BuildWorkspaceBootstrap(request)
}

func (a *App) RefreshRepo(repoID string, request snapshot.Request) (snapshot.RepoSnapshotUpdate, error) {
	return a.service.RefreshRepo(repoID, request)
}

func (a *App) MutateRepo(repoID, action string, request snapshot.Request, body snapshot.RepoActionRequest) (snapshot.RepoSnapshotUpdate, error) {
	return a.service.MutateRepo(repoID, action, request, body)
}

func (a *App) RunBatch(operation string, request snapshot.Request) (snapshot.BatchResult, error) {
	return a.service.RunBatch(operation, request)
}

func (a *App) GetRepoLog(repoID string, request snapshot.Request) (snapshot.RepoLog, error) {
	return a.service.GetRepoLog(repoID, request)
}

func (a *App) GetRepoHistory(repoID string, request snapshot.Request, offset, limit int) (snapshot.RepoHistoryPage, error) {
	return a.service.GetRepoHistory(repoID, request, offset, limit)
}

func (a *App) GetCommitDetail(repoID string, request snapshot.Request, hash string) (snapshot.CommitDetail, error) {
	return a.service.GetCommitDetail(repoID, request, hash)
}

func (a *App) GetFileDiff(request snapshot.FileDiffRequest) (snapshot.FileDiff, error) {
	return a.service.GetFileDiff(request)
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

func (a *App) EnsureTerminalSession(request TerminalSessionRequest) (TerminalSessionInfo, error) {
	if a.terminals == nil {
		return TerminalSessionInfo{}, errors.New("终端管理器尚未初始化")
	}
	return a.terminals.EnsureSession(request)
}

func (a *App) WriteTerminalInput(sessionID, data string) error {
	if a.terminals == nil {
		return errors.New("终端管理器尚未初始化")
	}
	return a.terminals.WriteInput(sessionID, data)
}

func (a *App) ResizeTerminal(sessionID string, cols, rows int) error {
	if a.terminals == nil {
		return errors.New("终端管理器尚未初始化")
	}
	return a.terminals.Resize(sessionID, cols, rows)
}

func (a *App) RestartTerminalSession(sessionID string, cols, rows int) (TerminalSessionInfo, error) {
	if a.terminals == nil {
		return TerminalSessionInfo{}, errors.New("终端管理器尚未初始化")
	}
	return a.terminals.RestartSession(sessionID, cols, rows)
}
