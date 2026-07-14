package snapshot

import (
	"errors"
	"fmt"
	"path/filepath"
	"strings"
	"time"
)

func (s *Service) GetFileDiff(request FileDiffRequest) (FileDiff, error) {
	entry, err := s.resolveRepoEntry(request.RepoID, request.Snapshot)
	if err != nil {
		return FileDiff{}, err
	}
	executor := newGitExecutor(request.Snapshot)
	repoSnapshot, err := executor.buildRepoSnapshot(entry, time.Now())
	if err != nil {
		return FileDiff{}, err
	}
	if repoSnapshot.repo.ID != request.RepoID {
		return FileDiff{}, fmt.Errorf("仓库路径与标识不匹配：%s", entry.repoPath)
	}
	file, err := findRequestedChange(repoSnapshot.detail.Files, request.FilePath, request.Staged)
	if err != nil {
		return FileDiff{}, err
	}
	content, err := executor.loadFileDiff(repoSnapshot.repo.Path, file)
	if err != nil {
		return FileDiff{}, err
	}
	return FileDiff{RepoID: request.RepoID, Path: file.Path, Staged: file.Staged, Content: content}, nil
}

func findRequestedChange(files []FileChange, requestedPath string, staged bool) (FileChange, error) {
	path, err := normalizeDiffPath(requestedPath)
	if err != nil {
		return FileChange{}, err
	}
	for _, file := range files {
		if file.Path == path && file.Staged == staged {
			return file, nil
		}
	}
	return FileChange{}, fmt.Errorf("未找到当前变更：%s", path)
}

func normalizeDiffPath(value string) (string, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return "", errors.New("缺少文件路径")
	}
	cleaned := filepath.Clean(filepath.FromSlash(trimmed))
	if filepath.IsAbs(cleaned) || cleaned == "." || cleaned == ".." || strings.HasPrefix(cleaned, ".."+string(filepath.Separator)) {
		return "", fmt.Errorf("文件路径超出仓库：%s", value)
	}
	return normalizePath(cleaned), nil
}

func (executor gitExecutor) loadFileDiff(repoPath string, file FileChange) (string, error) {
	if !file.Staged {
		trackedPath, err := executor.runGitAllowingExitCodeOne(repoPath, []string{
			"ls-files", "--error-unmatch", "--", file.Path,
		})
		if err != nil {
			return "", err
		}
		if trackedPath == "" {
			return executor.runGitAllowingExitCodeOne(repoPath, []string{
				"diff", "--no-index", "--no-ext-diff", "--unified=3", "--", "/dev/null", file.Path,
			})
		}
	}
	args := []string{"diff", "--no-ext-diff", "--unified=3"}
	if file.Staged {
		args = append(args, "--cached")
	}
	return executor.runGit(repoPath, append(args, "--", file.Path))
}
