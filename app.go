package main

import (
	"context"
	"errors"
	"os"

	"git-monorepo-tools/internal/desktop"
	"git-monorepo-tools/internal/terminal"
	"git-monorepo-tools/snapshot"
	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

type workspaceService interface {
	BuildAppSnapshot(snapshot.Request) (snapshot.AppSnapshot, error)
	BuildWorkspaceBootstrap(snapshot.Request) (snapshot.WorkspaceBootstrap, error)
	RefreshRepo(string, snapshot.Request) (snapshot.RepoSnapshotUpdate, error)
	MutateRepo(string, string, snapshot.Request, snapshot.RepoActionRequest) (snapshot.RepoSnapshotUpdate, error)
	RunBatch(string, snapshot.Request) (snapshot.BatchResult, error)
	GetRepoLog(string, snapshot.Request) (snapshot.RepoLog, error)
	GetRepoHistory(string, snapshot.Request, int, int) (snapshot.RepoHistoryPage, error)
	GetCommitDetail(string, snapshot.Request, string) (snapshot.CommitDetail, error)
	GetFileDiff(snapshot.FileDiffRequest) (snapshot.FileDiff, error)
	GenerateCommitMessage(string, snapshot.Request, snapshot.AICommitSettings) (string, error)
	RunRepoCommand(snapshot.RepoCommandRequest) (snapshot.RepoCommandResult, error)
	StreamRepoCommand(snapshot.RepoCommandRequest, func(string)) (snapshot.RepoCommandResult, error)
}

type desktopGateway interface {
	PickFolder(context.Context) (string, error)
	OpenFolder(string) error
	OpenTerminal(string) error
	OpenConflicts(string) error
	ReadClipboardImagePath() (string, error)
}

type terminalGateway interface {
	EnsureSession(terminal.TerminalSessionRequest) (terminal.TerminalSessionInfo, error)
	RestartSession(string, int, int) (terminal.TerminalSessionInfo, error)
	WriteInput(string, string) error
	Resize(string, int, int) error
	CloseAll()
}

type App struct {
	ctx       context.Context
	workspace workspaceService
	desktop   desktopGateway
	terminals terminalGateway
}

func NewApp() (*App, error) {
	root, err := os.Getwd()
	if err != nil {
		return nil, err
	}
	return newApp(snapshot.NewService(root), desktop.New()), nil
}

func newApp(workspace workspaceService, desktopClient desktopGateway) *App {
	return &App{workspace: workspace, desktop: desktopClient}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.terminals = terminal.NewManager(func(name string, payload any) {
		wruntime.EventsEmit(ctx, name, payload)
	})
}

func (a *App) shutdown(context.Context) {
	if a.terminals != nil {
		a.terminals.CloseAll()
	}
}

func (a *App) GetSnapshot(request snapshot.Request) (snapshot.AppSnapshot, error) {
	return a.workspace.BuildAppSnapshot(request)
}

func (a *App) GetWorkspaceBootstrap(request snapshot.Request) (snapshot.WorkspaceBootstrap, error) {
	return a.workspace.BuildWorkspaceBootstrap(request)
}

func (a *App) RefreshRepo(repoID string, request snapshot.Request) (snapshot.RepoSnapshotUpdate, error) {
	return a.workspace.RefreshRepo(repoID, request)
}

func (a *App) MutateRepo(repoID, action string, request snapshot.Request, body snapshot.RepoActionRequest) (snapshot.RepoSnapshotUpdate, error) {
	return a.workspace.MutateRepo(repoID, action, request, body)
}

func (a *App) RunBatch(operation string, request snapshot.Request) (snapshot.BatchResult, error) {
	return a.workspace.RunBatch(operation, request)
}

func (a *App) GetRepoLog(repoID string, request snapshot.Request) (snapshot.RepoLog, error) {
	return a.workspace.GetRepoLog(repoID, request)
}

func (a *App) GetRepoHistory(repoID string, request snapshot.Request, offset, limit int) (snapshot.RepoHistoryPage, error) {
	return a.workspace.GetRepoHistory(repoID, request, offset, limit)
}

func (a *App) GetCommitDetail(repoID string, request snapshot.Request, hash string) (snapshot.CommitDetail, error) {
	return a.workspace.GetCommitDetail(repoID, request, hash)
}

func (a *App) GetFileDiff(request snapshot.FileDiffRequest) (snapshot.FileDiff, error) {
	return a.workspace.GetFileDiff(request)
}

func (a *App) GenerateCommitMessage(repoID string, request snapshot.Request, settings snapshot.AICommitSettings) (string, error) {
	return a.workspace.GenerateCommitMessage(repoID, request, settings)
}

func (a *App) RunRepoCommand(request snapshot.RepoCommandRequest) (snapshot.RepoCommandResult, error) {
	if request.StreamID == "" {
		return a.workspace.RunRepoCommand(request)
	}
	return a.workspace.StreamRepoCommand(request, func(chunk string) {
		wruntime.EventsEmit(a.ctx, "repo-command-output", map[string]string{
			"streamId": request.StreamID,
			"chunk":    chunk,
		})
	})
}

func (a *App) PickFolder() (string, error) {
	return a.desktop.PickFolder(a.ctx)
}

func (a *App) OpenFolder(path string) error {
	return a.desktop.OpenFolder(path)
}

func (a *App) OpenTerminal(path string) error {
	return a.desktop.OpenTerminal(path)
}

func (a *App) OpenConflicts(path string) error {
	return a.desktop.OpenConflicts(path)
}

func (a *App) ReadClipboardImagePath() (string, error) {
	return a.desktop.ReadClipboardImagePath()
}

func (a *App) EnsureTerminalSession(request terminal.TerminalSessionRequest) (terminal.TerminalSessionInfo, error) {
	manager, err := a.terminalManager()
	if err != nil {
		return terminal.TerminalSessionInfo{}, err
	}
	return manager.EnsureSession(request)
}

func (a *App) RestartTerminalSession(sessionID string, cols, rows int) (terminal.TerminalSessionInfo, error) {
	manager, err := a.terminalManager()
	if err != nil {
		return terminal.TerminalSessionInfo{}, err
	}
	return manager.RestartSession(sessionID, cols, rows)
}

func (a *App) WriteTerminalInput(sessionID, data string) error {
	manager, err := a.terminalManager()
	if err != nil {
		return err
	}
	return manager.WriteInput(sessionID, data)
}

func (a *App) ResizeTerminal(sessionID string, cols, rows int) error {
	manager, err := a.terminalManager()
	if err != nil {
		return err
	}
	return manager.Resize(sessionID, cols, rows)
}

func (a *App) terminalManager() (terminalGateway, error) {
	if a.terminals == nil {
		return nil, errors.New("终端管理器尚未初始化")
	}
	return a.terminals, nil
}
