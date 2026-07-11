package snapshot

type Request struct {
	ScanRoots      []ScanRoot       `json:"scanRoots"`
	Concurrency    int              `json:"concurrency"`
	PullStrategy   string           `json:"pullStrategy"`
	PushStrategy   string           `json:"pushStrategy"`
	TimeoutSeconds int              `json:"timeoutSeconds"`
	RefreshRemotes bool             `json:"refreshRemotes,omitempty"`
	Proxy          GitProxySettings `json:"proxy"`
	RepoPath       string           `json:"repoPath,omitempty"`
	RepoCategory   string           `json:"repoCategory,omitempty"`
}

type RepoActionRequest struct {
	FileID       string `json:"fileId"`
	FilePath     string `json:"filePath"`
	Message      string `json:"message"`
	RepoPath     string `json:"repoPath"`
	RepoCategory string `json:"repoCategory"`
}

type RepoCommandRequest struct {
	RepoPath       string           `json:"repoPath"`
	Command        string           `json:"command"`
	StreamID       string           `json:"streamId,omitempty"`
	TimeoutSeconds int              `json:"timeoutSeconds"`
	Proxy          GitProxySettings `json:"proxy"`
}

type RepoCommandResult struct {
	RepoPath  string `json:"repoPath"`
	Command   string `json:"command"`
	Output    string `json:"output"`
	ExitCode  int    `json:"exitCode"`
	StartedAt int64  `json:"startedAt"`
	EndedAt   int64  `json:"endedAt"`
}

type AICommitSettings struct {
	APIKey         string `json:"apiKey"`
	BaseURL        string `json:"baseUrl"`
	Model          string `json:"model"`
	MaxDiffChars   int    `json:"maxDiffChars"`
	GenerateThree  bool   `json:"generateThree"`
	StagedOnly     bool   `json:"stagedOnly"`
	PromptTemplate string `json:"promptTemplate"`
}

type GitProxySettings struct {
	Enabled bool   `json:"enabled"`
	Host    string `json:"host"`
	Port    int    `json:"port"`
}

type ScanRoot struct {
	Path     string `json:"path"`
	Category string `json:"category"`
}

type WorkspaceBootstrap struct {
	Repos          []Repo   `json:"repos"`
	SelectedRepoID string   `json:"selectedRepoId"`
	ScannedAt      string   `json:"scannedAt"`
	Categories     []string `json:"categories"`
}

type AppSnapshot struct {
	ScannedAt        string                       `json:"scannedAt"`
	Categories       []string                     `json:"categories"`
	Repos            []RepoDetail                 `json:"repos"`
	RepoDetails      map[string]RepoDetail        `json:"repoDetails"`
	SelectedRepoID   string                       `json:"selectedRepoId"`
	PullResults      []PullResult                 `json:"pullResults"`
	CommitCandidates map[string][]CommitCandidate `json:"commitCandidates"`
}

type RepoSnapshotUpdate struct {
	Repo             RepoDetail        `json:"repo"`
	CommitCandidates []CommitCandidate `json:"commitCandidates"`
	ScannedAt        string            `json:"scannedAt"`
}

type Repo struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Branch    string `json:"branch"`
	Path      string `json:"path"`
	Remote    string `json:"remote"`
	Category  string `json:"category"`
	Modified  int    `json:"modified"`
	Ahead     int    `json:"ahead"`
	Behind    int    `json:"behind"`
	Conflicts int    `json:"conflicts"`
	Status    string `json:"status"`
	ScanError string `json:"scanError,omitempty"`
	LastScan  string `json:"lastScan"`
}

type RepoDetail struct {
	Repo
	Files          []FileChange    `json:"files"`
	StagedCount    int             `json:"stagedCount"`
	UnstagedCount  int             `json:"unstagedCount"`
	ScannedAt      string          `json:"scannedAt"`
	History        []CommitSummary `json:"history"`
	HistoryTotal   int             `json:"historyTotal"`
	HistoryHasMore bool            `json:"historyHasMore"`
}

type FileChange struct {
	ID        string `json:"id"`
	Status    string `json:"status"`
	Path      string `json:"path"`
	Additions int    `json:"additions"`
	Deletions int    `json:"deletions"`
	Size      string `json:"size"`
	Staged    bool   `json:"staged"`
}

type PullResult struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Path    string `json:"path"`
	Result  string `json:"result"`
	Detail  string `json:"detail"`
	Commits int    `json:"commits,omitempty"`
}

type CommitCandidate struct {
	ID    string `json:"id"`
	Style string `json:"style"`
	Icon  string `json:"icon"`
	Title string `json:"title"`
	Body  string `json:"body"`
	Full  string `json:"full"`
}

type CommitSummary struct {
	Hash      string   `json:"hash"`
	ShortHash string   `json:"shortHash"`
	Author    string   `json:"author"`
	Time      string   `json:"time"`
	Message   string   `json:"message"`
	Additions int      `json:"additions"`
	Deletions int      `json:"deletions"`
	Parents   int      `json:"parents"`
	Refs      []string `json:"refs,omitempty"`
	Files     int      `json:"files"`
}

type CommitDetail struct {
	CommitSummary
	Body         string   `json:"body"`
	AuthorEmail  string   `json:"authorEmail"`
	CommittedAt  string   `json:"committedAt"`
	FilesChanged []string `json:"filesChanged"`
}

type RepoHistoryPage struct {
	RepoID   string          `json:"repoId"`
	RepoName string          `json:"repoName"`
	Path     string          `json:"path"`
	Offset   int             `json:"offset"`
	Limit    int             `json:"limit"`
	Total    int             `json:"total"`
	HasMore  bool            `json:"hasMore"`
	Commits  []CommitSummary `json:"commits"`
}

type RepoLog struct {
	RepoID   string `json:"repoId"`
	RepoName string `json:"repoName"`
	Path     string `json:"path"`
	Content  string `json:"content"`
}

type BatchResult struct {
	Updates   []RepoSnapshotUpdate `json:"updates,omitempty"`
	Results   []PullResult         `json:"results,omitempty"`
	Operation string               `json:"operation,omitempty"`
	ScannedAt string               `json:"scannedAt"`
}
