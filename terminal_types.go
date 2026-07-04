package main

const (
	terminalOutputEventName = "repo-terminal-output"
	terminalExitEventName   = "repo-terminal-exit"
	defaultTerminalCols     = 120
	defaultTerminalRows     = 32
)

type TerminalSessionRequest struct {
	RepoID   string `json:"repoId"`
	RepoPath string `json:"repoPath"`
	Cols     int    `json:"cols,omitempty"`
	Rows     int    `json:"rows,omitempty"`
}

type TerminalSessionInfo struct {
	SessionID string `json:"sessionId"`
	RepoID    string `json:"repoId"`
	RepoPath  string `json:"repoPath"`
	Shell     string `json:"shell"`
	StartedAt int64  `json:"startedAt"`
}

type terminalOutputEvent struct {
	SessionID string `json:"sessionId"`
	Chunk     string `json:"chunk"`
}

type terminalExitEvent struct {
	SessionID string `json:"sessionId"`
	ExitCode  int    `json:"exitCode"`
}

func normalizeTerminalSize(cols, rows int) (int, int) {
	if cols < 2 {
		cols = defaultTerminalCols
	}
	if rows < 1 {
		rows = defaultTerminalRows
	}
	return cols, rows
}
