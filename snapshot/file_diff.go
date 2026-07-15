package snapshot

import (
	"errors"
	"fmt"
	"path/filepath"
	"strings"
)

func (s *Service) GetFileDiff(request FileDiffRequest) (FileDiff, error) {
	entry, err := s.resolveRepoEntry(request.RepoID, request.Snapshot)
	if err != nil {
		return FileDiff{}, err
	}
	path, err := normalizeDiffPath(request.FilePath)
	if err != nil {
		return FileDiff{}, err
	}
	repoPath := normalizePath(entry.repoPath)
	if repoIDForPath(repoPath) != request.RepoID {
		return FileDiff{}, fmt.Errorf("仓库路径与标识不匹配：%s", repoPath)
	}
	executor := newGitExecutor(request.Snapshot)
	file, untracked, err := executor.validateRequestedChange(repoPath, path, request.Staged)
	if err != nil {
		return FileDiff{}, err
	}
	content, err := executor.loadFileDiff(repoPath, file, untracked)
	if err != nil {
		return FileDiff{}, err
	}
	if content == "" {
		return FileDiff{}, fmt.Errorf("未找到当前变更：%s", path)
	}
	return FileDiff{RepoID: request.RepoID, Path: path, Staged: request.Staged, Content: content}, nil
}

func (executor gitExecutor) validateRequestedChange(repoPath, path string, staged bool) (FileChange, bool, error) {
	output, err := executor.runGit(repoPath, []string{
		"--literal-pathspecs", "status", "--porcelain=v2", "-z", "--untracked-files=all", "--", path,
	})
	if err != nil {
		return FileChange{}, false, err
	}
	statuses := parseRequestedStatuses(output)
	if len(statuses) != 1 || !statuses[0].matches(path, staged) {
		return FileChange{}, false, fmt.Errorf("未找到当前变更：%s", path)
	}
	return FileChange{Path: path, Staged: staged}, statuses[0].untracked, nil
}

type requestedStatus struct {
	indexChanged    bool
	worktreeChanged bool
	untracked       bool
	path            string
	originalPath    string
}

func (status requestedStatus) matches(path string, staged bool) bool {
	exactPath := status.path == path || status.originalPath == path
	return exactPath && ((staged && status.indexChanged) || (!staged && status.worktreeChanged))
}

func parseRequestedStatuses(output string) []requestedStatus {
	records := strings.Split(output, "\x00")
	statuses := make([]requestedStatus, 0, len(records))
	for index := 0; index < len(records); index++ {
		status, hasOriginal := parseRequestedStatusRecord(records[index])
		if status.path == "" {
			continue
		}
		if hasOriginal {
			if index+1 >= len(records) || records[index+1] == "" {
				continue
			}
			index++
			status.originalPath = normalizePath(records[index])
		}
		statuses = append(statuses, status)
	}
	return statuses
}

func parseRequestedStatusRecord(record string) (requestedStatus, bool) {
	if strings.HasPrefix(record, "? ") {
		return requestedStatus{worktreeChanged: true, untracked: true, path: normalizePath(record[2:])}, false
	}
	if strings.HasPrefix(record, "1 ") {
		return parseTrackedStatusRecord(record, 9), false
	}
	if strings.HasPrefix(record, "2 ") {
		return parseTrackedStatusRecord(record, 10), true
	}
	if strings.HasPrefix(record, "u ") {
		return parseTrackedStatusRecord(record, 11), false
	}
	return requestedStatus{}, false
}

func parseTrackedStatusRecord(record string, fieldCount int) requestedStatus {
	fields := strings.SplitN(record, " ", fieldCount)
	if len(fields) != fieldCount || len(fields[1]) != 2 {
		return requestedStatus{}
	}
	return requestedStatus{
		indexChanged:    fields[1][0] != '.',
		worktreeChanged: fields[1][1] != '.',
		path:            normalizePath(fields[fieldCount-1]),
	}
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

func (executor gitExecutor) loadFileDiff(repoPath string, file FileChange, untracked bool) (string, error) {
	if untracked {
		return executor.runGitAllowingExitCodeOne(repoPath, []string{
			"diff", "--no-index", "--no-ext-diff", "--unified=3", "--", "/dev/null", file.Path,
		})
	}
	args := []string{"diff", "--no-ext-diff", "--unified=3"}
	if file.Staged {
		args = append(args, "--cached")
	}
	args = append([]string{"--literal-pathspecs"}, args...)
	return executor.runGit(repoPath, append(args, "--", file.Path))
}
