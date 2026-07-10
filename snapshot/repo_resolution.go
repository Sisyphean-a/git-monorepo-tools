package snapshot

import (
	"fmt"
	"path/filepath"
	"strings"
	"time"
)

func (s *Service) resolveRepoForAction(repoID, action string, request Request, body RepoActionRequest) (RepoDetail, error) {
	executor := newGitExecutor(request)
	return resolveRepoForActionWithLoad(
		repoID,
		action,
		body,
		func() []repoEntry {
			return s.discoverRepos(s.buildRoots(request))
		},
		time.Now(),
		executor.buildRepoSnapshot,
	)
}

func (s *Service) resolveRepo(repoID string, request Request) (RepoDetail, error) {
	executor := newGitExecutor(request)
	return resolveRepoFromEntries(repoID, s.discoverRepos(s.buildRoots(request)), time.Now(), executor.buildRepoSnapshot)
}

func (s *Service) resolveRepoEntry(repoID string, request Request) (repoEntry, error) {
	if hinted, ok, err := resolveRepoEntryHint(repoID, request.RepoPath, request.RepoCategory); err != nil {
		return repoEntry{}, err
	} else if ok {
		return hinted, nil
	}
	return resolveRepoEntryFromEntries(repoID, s.discoverRepos(s.buildRoots(request)))
}

func resolveRepoByPath(
	repoID string,
	repoPath string,
	scanTime time.Time,
	loadSnapshot func(repoEntry, time.Time) (repoSnapshot, error),
) (RepoDetail, error) {
	snapshot, err := loadSnapshot(repoEntry{repoPath: repoPath}, scanTime)
	if err != nil {
		return RepoDetail{}, err
	}
	if snapshot.repo.ID != repoID {
		return RepoDetail{}, fmt.Errorf("仓库路径与标识不匹配：%s", repoPath)
	}
	return snapshot.detail, nil
}

func resolveRepoFromEntries(
	repoID string,
	entries []repoEntry,
	scanTime time.Time,
	loadSnapshot func(repoEntry, time.Time) (repoSnapshot, error),
) (RepoDetail, error) {
	for _, entry := range entries {
		if repoIDForPath(entry.repoPath) != repoID {
			continue
		}
		snapshot, err := loadSnapshot(entry, scanTime)
		if err != nil {
			return RepoDetail{}, err
		}
		return snapshot.detail, nil
	}
	return RepoDetail{}, fmt.Errorf("未找到仓库：%s", repoID)
}

func resolveRepoEntryFromEntries(repoID string, entries []repoEntry) (repoEntry, error) {
	for _, entry := range entries {
		if repoIDForPath(entry.repoPath) == repoID {
			return entry, nil
		}
	}
	return repoEntry{}, fmt.Errorf("未找到仓库：%s", repoID)
}

func repoIDForPath(repoPath string) string {
	normalized := normalizePath(repoPath)
	return createRepoID(filepath.Base(normalized), normalized)
}

func resolveRepoEntryHint(repoID, repoPath, category string) (repoEntry, bool, error) {
	if strings.TrimSpace(category) == "" {
		return repoEntry{}, false, nil
	}
	hintedPath, ok, err := validateRepoPathHint(repoID, repoPath)
	if err != nil || !ok {
		return repoEntry{}, false, err
	}
	return repoEntry{repoPath: hintedPath, category: strings.TrimSpace(category)}, true, nil
}

func resolveRepoPathHint(repoID, action, repoPath string) (RepoDetail, bool) {
	if !actionUsesRepoPathOnly(action) {
		return RepoDetail{}, false
	}
	hintedPath, ok := validRepoPathHint(repoID, repoPath)
	if !ok {
		return RepoDetail{}, false
	}
	return RepoDetail{Repo: Repo{ID: repoID, Path: hintedPath}}, true
}

func resolveRepoForActionWithLoad(
	repoID string,
	action string,
	body RepoActionRequest,
	discoverEntries func() []repoEntry,
	scanTime time.Time,
	loadSnapshot func(repoEntry, time.Time) (repoSnapshot, error),
) (RepoDetail, error) {
	if hinted, ok := resolveRepoPathHint(repoID, action, body.RepoPath); ok {
		return hinted, nil
	}
	if hintedPath, ok := validRepoPathHint(repoID, body.RepoPath); ok {
		return resolveRepoByPath(repoID, hintedPath, scanTime, loadSnapshot)
	}
	return resolveRepoFromEntries(repoID, discoverEntries(), scanTime, loadSnapshot)
}

func validRepoPathHint(repoID, repoPath string) (string, bool) {
	hintedPath, ok, err := validateRepoPathHint(repoID, repoPath)
	if err != nil {
		return "", false
	}
	return hintedPath, ok
}

func validateRepoPathHint(repoID, repoPath string) (string, bool, error) {
	trimmed := strings.TrimSpace(repoPath)
	if trimmed == "" {
		return "", false, nil
	}
	normalized := normalizePath(trimmed)
	if repoIDForPath(normalized) != repoID {
		return "", false, fmt.Errorf("仓库路径与标识不匹配：%s", normalized)
	}
	return normalized, true, nil
}

func actionUsesRepoPathOnly(action string) bool {
	switch action {
	case "stage-all", "unstage-all", "stage-file", "unstage-file", "commit", "discard-all":
		return true
	default:
		return false
	}
}
