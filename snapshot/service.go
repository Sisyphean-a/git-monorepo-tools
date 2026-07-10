package snapshot

import (
	"crypto/sha1"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"time"
)

const (
	defaultPullStrategy = "ff-only"
	defaultPushStrategy = "upstream-only"
)

type Service struct {
	projectRoot string
}

type repoEntry struct {
	repoPath string
	category string
}

type repoSnapshot struct {
	repo             Repo
	detail           RepoDetail
	commitCandidates []CommitCandidate
	pullResult       PullResult
}

func NewService(projectRoot string) *Service {
	return &Service{projectRoot: normalizePath(projectRoot)}
}

func (s *Service) BuildAppSnapshot(request Request) (AppSnapshot, error) {
	return s.buildSnapshot(request, nil)
}

func (s *Service) BuildWorkspaceBootstrap(request Request) (WorkspaceBootstrap, error) {
	scanTime := time.Now()
	entries := s.discoverRepos(s.buildRoots(request))
	snapshots := s.sortSnapshots(buildBootstrapSnapshots(entries, scanTime))

	return WorkspaceBootstrap{
		Repos:          orderedRepos(snapshots),
		SelectedRepoID: s.selectedRepoID(snapshots),
		ScannedAt:      formatDateTime(scanTime),
		Categories:     uniqueCategories(snapshots),
	}, nil
}

func (s *Service) BuildRepoSnapshot(repoID string, request Request, refreshRemotes bool) (RepoSnapshotUpdate, error) {
	entry, err := s.resolveRepoEntry(repoID, request)
	if err != nil {
		return RepoSnapshotUpdate{}, err
	}
	return s.buildRepoUpdate(repoID, entry.repoPath, entry.category, refreshRemotes)
}

func (s *Service) buildSnapshot(request Request, pullResults []PullResult) (AppSnapshot, error) {
	scanTime := time.Now()
	repoEntries := s.discoverRepos(s.buildRoots(request))
	snapshots := s.buildSnapshots(repoEntries, scanTime, request.Concurrency, request.RefreshRemotes)
	ordered := s.sortSnapshots(snapshots)
	selectedID := s.selectedRepoID(ordered)
	results := orderedPullResults(ordered)
	if pullResults != nil {
		results = pullResults
	}

	return AppSnapshot{
		ScannedAt:        formatDateTime(scanTime),
		Categories:       uniqueCategories(ordered),
		Repos:            orderedDetails(ordered),
		RepoDetails:      orderedDetailsMap(ordered),
		SelectedRepoID:   selectedID,
		PullResults:      results,
		CommitCandidates: orderedCandidates(ordered),
	}, nil
}

func (s *Service) buildRoots(request Request) []ScanRoot {
	roots := make([]ScanRoot, 0, len(request.ScanRoots))

	for _, root := range request.ScanRoots {
		if strings.TrimSpace(root.Path) == "" {
			continue
		}
		category := strings.TrimSpace(root.Category)
		if category == "" {
			category = classifyCustomRoot(root.Path)
		}
		roots = append(roots, ScanRoot{Path: normalizePath(root.Path), Category: category})
	}

	return dedupeRoots(roots)
}

func (s *Service) discoverRepos(roots []ScanRoot) []repoEntry {
	repos := map[string]repoEntry{}
	for _, root := range roots {
		for _, repoPath := range collectRepoPaths(root.Path) {
			key := strings.ToLower(repoPath)
			if _, exists := repos[key]; exists {
				continue
			}
			repos[key] = repoEntry{repoPath: repoPath, category: root.Category}
		}
	}

	entries := make([]repoEntry, 0, len(repos))
	for _, entry := range repos {
		entries = append(entries, entry)
	}
	return entries
}

func (s *Service) buildSnapshots(entries []repoEntry, scanTime time.Time, concurrency int, refreshRemotes bool) []repoSnapshot {
	return buildSnapshots(entries, scanTime, concurrency, refreshRemotes)
}

func buildBootstrapSnapshots(entries []repoEntry, scanTime time.Time) []repoSnapshot {
	snapshots := make([]repoSnapshot, 0, len(entries))
	for _, entry := range entries {
		snapshots = append(snapshots, buildBootstrapRepo(entry, scanTime))
	}
	return snapshots
}

func buildBootstrapRepo(entry repoEntry, scanTime time.Time) repoSnapshot {
	repoPath := normalizePath(entry.repoPath)
	repoName := filepath.Base(repoPath)
	return repoSnapshot{
		repo: Repo{
			ID:       createRepoID(repoName, repoPath),
			Name:     repoName,
			Branch:   "扫描中",
			Path:     repoPath,
			Remote:   "—",
			Category: entry.category,
			Status:   "checking",
			LastScan: formatTime(scanTime),
		},
	}
}

func (s *Service) sortSnapshots(items []repoSnapshot) []repoSnapshot {
	sorted := slices.Clone(items)
	slices.SortFunc(sorted, func(left, right repoSnapshot) int {
		if left.repo.Path == s.projectRoot {
			return -1
		}
		if right.repo.Path == s.projectRoot {
			return 1
		}
		if left.repo.Modified != right.repo.Modified {
			return right.repo.Modified - left.repo.Modified
		}
		if nameDiff := strings.Compare(left.repo.Name, right.repo.Name); nameDiff != 0 {
			return nameDiff
		}
		return strings.Compare(left.repo.Path, right.repo.Path)
	})
	return sorted
}

func (s *Service) selectedRepoID(items []repoSnapshot) string {
	for _, item := range items {
		if item.repo.Path == s.projectRoot {
			return item.repo.ID
		}
	}
	if len(items) == 0 {
		return ""
	}
	return items[0].repo.ID
}

func orderedRepos(items []repoSnapshot) []Repo {
	repos := make([]Repo, 0, len(items))
	for _, item := range items {
		repos = append(repos, item.repo)
	}
	return repos
}

func buildRepoSnapshot(entry repoEntry, scanTime time.Time) (repoSnapshot, error) {
	return buildRepoSnapshotWithRemoteMode(entry, scanTime, false)
}

func (s *Service) buildRepoUpdate(repoID, repoPath, category string, refreshRemotes bool) (RepoSnapshotUpdate, error) {
	scanTime := time.Now()
	snapshot, err := buildRepoSnapshotWithRemoteMode(repoEntry{
		repoPath: repoPath,
		category: category,
	}, scanTime, refreshRemotes)
	if err != nil {
		return RepoSnapshotUpdate{}, err
	}
	if snapshot.repo.ID != repoID {
		return RepoSnapshotUpdate{}, fmt.Errorf("仓库路径与标识不匹配：%s", repoPath)
	}
	return RepoSnapshotUpdate{
		Repo:             snapshot.detail,
		CommitCandidates: snapshot.commitCandidates,
		ScannedAt:        formatDateTime(scanTime),
	}, nil
}

func buildRepoSnapshotWithRemoteMode(entry repoEntry, scanTime time.Time, refreshRemotes bool) (repoSnapshot, error) {
	repoPath := normalizePath(entry.repoPath)
	repoName := filepath.Base(repoPath)
	parsed, statusErr := loadRepoStatus(repoPath, refreshRemotes)
	files, filesErr := buildFileChanges(repoPath, parsed.entries)
	history, historyTotal, historyHasMore, historyErr := buildHistory(repoPath)
	scanError := ""
	if err := firstGitError(statusErr, filesErr, historyErr); err != nil {
		scanError = err.Error()
	}
	modified := uniquePathCount(files)

	repo := Repo{
		ID:        createRepoID(repoName, repoPath),
		Name:      repoName,
		Branch:    parsed.branch,
		Path:      repoPath,
		Remote:    parsed.remote,
		Category:  entry.category,
		Modified:  modified,
		Ahead:     parsed.ahead,
		Behind:    parsed.behind,
		Conflicts: parsed.conflicts,
		Status:    repoStatus(scanError, parsed.conflicts, modified),
		ScanError: scanError,
		LastScan:  formatTime(scanTime),
	}

	detail := RepoDetail{
		Repo:           repo,
		Files:          files,
		StagedCount:    countStaged(files, true),
		UnstagedCount:  countStaged(files, false),
		ScannedAt:      formatDateTime(scanTime),
		History:        history,
		HistoryTotal:   historyTotal,
		HistoryHasMore: historyHasMore,
	}

	return repoSnapshot{
		repo:             repo,
		detail:           detail,
		commitCandidates: buildCommitCandidates(files),
		pullResult:       buildPullResult(repo, repoPath),
	}, nil
}

func collectRepoPaths(rootPath string) []string {
	if !pathExists(rootPath) {
		return nil
	}

	paths := []string{}
	if isGitRepo(rootPath) {
		paths = append(paths, normalizePath(rootPath))
	}

	entries, err := os.ReadDir(rootPath)
	if err != nil {
		return paths
	}
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		child := filepath.Join(rootPath, entry.Name())
		if isGitRepo(child) {
			paths = append(paths, normalizePath(child))
		}
	}
	return paths
}

func dedupeRoots(roots []ScanRoot) []ScanRoot {
	seen := map[string]bool{}
	result := make([]ScanRoot, 0, len(roots))
	for _, root := range roots {
		key := strings.ToLower(normalizePath(root.Path))
		if key == "" || seen[key] {
			continue
		}
		seen[key] = true
		root.Path = normalizePath(root.Path)
		result = append(result, root)
	}
	return result
}

func classifyCustomRoot(rootPath string) string {
	base := filepath.Base(rootPath)
	if base == "." || base == "" {
		base = "自定义"
	}
	return fmt.Sprintf("%s 工作区", base)
}

func createRepoID(repoName, repoPath string) string {
	sum := sha1.Sum([]byte(repoPath))
	slug := strings.Trim(strings.ToLower(nonAlphaNum.ReplaceAllString(repoName, "-")), "-")
	if slug == "" {
		slug = "repo"
	}
	return fmt.Sprintf("%s-%s", slug, hex.EncodeToString(sum[:])[:6])
}
