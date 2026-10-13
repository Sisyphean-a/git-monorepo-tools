package snapshot

import (
	"errors"
	"fmt"
	"path/filepath"
	"strings"
	"time"
)

func (s *Service) MutateRepo(repoID, action string, request Request, body RepoActionRequest) (RepoSnapshotUpdate, error) {
	repo, err := s.resolveRepoForAction(repoID, action, request, body)
	if err != nil {
		return RepoSnapshotUpdate{}, err
	}
	executor := s.gitExecutor(request)
	if err := executor.mutateRepo(repo, action, request, body); err != nil {
		return RepoSnapshotUpdate{}, err
	}
	update, err := executor.buildRepoUpdate(repo.ID, repo.Path, repo.Category, request.RefreshRemotes)
	if err != nil {
		return RepoSnapshotUpdate{}, fmt.Errorf("操作已完成，但刷新仓库状态失败：%w", err)
	}
	if action == "pull" && update.Repo.RemoteCheck == nil {
		update.Repo.RemoteCheck = &RemoteCheck{Status: "success", CheckedAt: formatDateTime(time.Now())}
	}
	return update, nil
}

func (s *Service) RefreshRepo(repoID string, request Request) (RepoSnapshotUpdate, error) {
	return s.BuildRepoSnapshot(repoID, request, request.RefreshRemotes)
}

func (s *Service) RunBatch(operation string, request Request) (BatchResult, error) {
	states, err := s.buildBatchStates(request)
	if err != nil {
		return BatchResult{}, err
	}
	executor := s.gitExecutor(request)
	results, err := executor.runBatch(states, operation, request)
	if err != nil {
		return BatchResult{}, err
	}
	updates := executor.buildBatchUpdates(states, results)
	return BatchResult{
		Updates:   updates,
		Results:   results,
		Operation: batchOperationName(operation),
		ScannedAt: formatDateTime(time.Now()),
	}, nil
}

func (s *Service) GetRepoLog(repoID string, request Request) (RepoLog, error) {
	entry, err := s.resolveRepoEntry(repoID, request)
	if err != nil {
		return RepoLog{}, err
	}
	content, err := newGitExecutor(request).runGit(entry.repoPath, []string{
		"log", "--decorate", "-10", "--format=%h%x09%an%x09%ar%x09%s",
	})
	if err != nil {
		return RepoLog{}, err
	}
	if content == "" {
		content = "暂无日志内容"
	}
	return RepoLog{RepoID: repoID, RepoName: filepath.Base(entry.repoPath), Path: entry.repoPath, Content: content}, nil
}

func (s *Service) GetRepoHistory(repoID string, request Request, offset, limit int) (RepoHistoryPage, error) {
	entry, err := s.resolveRepoEntry(repoID, request)
	if err != nil {
		return RepoHistoryPage{}, err
	}
	commits, hasMore, err := newGitExecutor(request).loadHistoryPage(entry.repoPath, offset, limit)
	if isNoCommitHistoryError(err) {
		return RepoHistoryPage{
			RepoID:   repoID,
			RepoName: filepath.Base(entry.repoPath),
			Path:     entry.repoPath,
			Offset:   max(offset, 0),
			Limit:    normalizeHistoryLimit(limit),
			Total:    0,
			HasMore:  false,
			Commits:  []CommitSummary{},
		}, nil
	}
	if err != nil {
		return RepoHistoryPage{}, err
	}
	normalizedOffset := max(offset, 0)
	return RepoHistoryPage{
		RepoID:   repoID,
		RepoName: filepath.Base(entry.repoPath),
		Path:     entry.repoPath,
		Offset:   normalizedOffset,
		Limit:    normalizeHistoryLimit(limit),
		Total:    pageHistoryTotal(normalizedOffset, len(commits), hasMore),
		HasMore:  hasMore,
		Commits:  commits,
	}, nil
}

func (s *Service) GetCommitDetail(repoID string, request Request, hash string) (CommitDetail, error) {
	entry, err := s.resolveRepoEntry(repoID, request)
	if err != nil {
		return CommitDetail{}, err
	}
	if strings.TrimSpace(hash) == "" {
		return CommitDetail{}, errors.New("缺少提交哈希")
	}
	return newGitExecutor(request).loadCommitDetail(entry.repoPath, hash)
}

func (s *Service) GetWorkingDiffFiles(repoID string, request Request) ([]FileChange, error) {
	entry, err := s.resolveRepoEntry(repoID, request)
	if err != nil {
		return nil, err
	}
	return newGitExecutor(request).loadWorkingDiffFiles(entry.repoPath)
}

func (executor gitExecutor) mutateRepo(repo RepoDetail, action string, request Request, body RepoActionRequest) error {
	switch action {
	case "stage-all":
		_, err := executor.runGit(repo.Path, []string{"add", "-A"})
		return err
	case "unstage-all":
		_, err := executor.runGit(repo.Path, []string{"restore", "--staged", "."})
		return err
	case "stage-file":
		filePath, err := parseFilePath(body)
		if err != nil {
			return err
		}
		_, err = executor.runGit(repo.Path, []string{"add", "--", filePath})
		return err
	case "unstage-file":
		filePath, err := parseFilePath(body)
		if err != nil {
			return err
		}
		_, err = executor.runGit(repo.Path, []string{"restore", "--staged", "--", filePath})
		return err
	case "commit":
		if err := ensureCommitMessage(body.Message); err != nil {
			return err
		}
		_, err := executor.runGit(repo.Path, []string{"commit", "-m", body.Message})
		return err
	case "pull":
		if err := ensurePullReady(repo); err != nil {
			return err
		}
		_, err := executor.runGit(repo.Path, pullArgs(request.PullStrategy))
		return err
	case "push":
		if repo.Remote == "—" {
			return errors.New("当前分支没有 upstream，暂不支持自动 push")
		}
		_, err := executor.runGit(repo.Path, []string{"push"})
		return err
	case "discard-all":
		if _, err := executor.runGit(repo.Path, []string{"reset", "--hard", "HEAD"}); err != nil {
			return err
		}
		if _, err := executor.runGit(repo.Path, []string{"clean", "-fd"}); err != nil {
			return fmt.Errorf("已重置已跟踪文件，但清理未跟踪文件失败：%w", err)
		}
		return nil
	default:
		return fmt.Errorf("未找到操作：%s", action)
	}
}

func (executor gitExecutor) runBatch(states []batchRepoState, operation string, request Request) ([]PullResult, error) {
	if operation != "pull" && operation != "push" {
		return nil, fmt.Errorf("未找到批量操作：%s", operation)
	}
	return runBatchConcurrent(states, request.Concurrency, func(state batchRepoState) PullResult {
		if operation == "pull" {
			return executor.executePullAll(state.detail, request.PullStrategy)
		}
		return executor.executePushAll(state.detail, request.PushStrategy)
	}), nil
}

func (executor gitExecutor) executePullAll(repo RepoDetail, strategy string) PullResult {
	if repo.ScanError != "" {
		return PullResult{ID: repo.ID, Name: repo.Name, Path: repo.Path, Result: "failed", Detail: "仓库扫描失败：" + repo.ScanError}
	}
	if repo.Conflicts > 0 {
		return PullResult{ID: repo.ID, Name: repo.Name, Path: repo.Path, Result: "failed", Detail: "检测到冲突，需先人工处理"}
	}
	if repo.Modified > 0 || len(repo.Files) > 0 {
		return PullResult{ID: repo.ID, Name: repo.Name, Path: repo.Path, Result: "skipped", Detail: "跳过：存在本地未提交改动"}
	}
	if repo.Remote == "—" {
		return PullResult{ID: repo.ID, Name: repo.Name, Path: repo.Path, Result: "skipped", Detail: "跳过：当前分支没有 upstream"}
	}
	parsed, check, err := executor.readStatusAfterRemoteSync(repo.Path)
	result := PullResult{ID: repo.ID, Name: repo.Name, Path: repo.Path, RemoteCheck: check}
	if err != nil {
		result.Result = "failed"
		result.Detail = "检查远端及仓库状态失败：" + err.Error()
		return result
	}
	repo.Remote, repo.Ahead, repo.Behind = parsed.remote, parsed.ahead, parsed.behind
	repo.Modified, repo.Conflicts = len(parsed.entries), parsed.conflicts
	// Rule: Fetch 期间工作树或跟踪分支可能变化，拉取前再次校验安全条件。
	if err := ensurePullReady(repo); err != nil {
		result.Result, result.Detail = "failed", err.Error()
		return result
	}
	if repo.Ahead > 0 && repo.Behind > 0 {
		result.Result, result.Detail = "skipped", "跳过：当前分支与远端已分叉"
		return result
	}
	if repo.Behind == 0 {
		result.Result, result.Detail = "uptodate", "远端已检查，工作区干净，已与远端同步"
		if repo.Ahead > 0 {
			result.Result = "skipped"
			result.Detail = fmt.Sprintf("无需 Pull：本地领先 %d 个提交，可执行 Push", repo.Ahead)
		}
		return result
	}
	if _, err := executor.runGit(repo.Path, pullArgs(strategy)); err != nil {
		result.Result, result.Detail = "failed", err.Error()
		return result
	}
	result.Result, result.Detail, result.Commits = "pulled", fmt.Sprintf("已拉取 %d 个提交", repo.Behind), repo.Behind
	return result
}

func (executor gitExecutor) executePushAll(repo RepoDetail, strategy string) PullResult {
	if repo.Remote == "—" {
		return PullResult{ID: repo.ID, Name: repo.Name, Path: repo.Path, Result: "skipped", Detail: "跳过：当前分支没有 upstream"}
	}
	if effectivePushStrategy(strategy) == "upstream-only" && repo.Ahead == 0 {
		return PullResult{ID: repo.ID, Name: repo.Name, Path: repo.Path, Result: "uptodate", Detail: "没有需要推送的提交"}
	}
	if repo.Ahead == 0 {
		return PullResult{ID: repo.ID, Name: repo.Name, Path: repo.Path, Result: "uptodate", Detail: "没有需要推送的提交"}
	}
	if _, err := executor.runGit(repo.Path, []string{"push"}); err != nil {
		return PullResult{ID: repo.ID, Name: repo.Name, Path: repo.Path, Result: "failed", Detail: err.Error()}
	}
	return PullResult{ID: repo.ID, Name: repo.Name, Path: repo.Path, Result: "pushed", Detail: fmt.Sprintf("已推送 %d 个提交", repo.Ahead), Commits: repo.Ahead}
}

func runGitStrict(repoPath string, args []string) (string, error) {
	return runGit(repoPath, args)
}

func parseFilePath(body RepoActionRequest) (string, error) {
	if strings.TrimSpace(body.FilePath) != "" {
		return body.FilePath, nil
	}
	if strings.TrimSpace(body.FileID) == "" {
		return "", errors.New("缺少文件标识")
	}
	parts := strings.SplitN(body.FileID, "::", 2)
	return parts[0], nil
}

func ensureCommitMessage(message string) error {
	if strings.TrimSpace(message) == "" {
		return errors.New("提交信息不能为空")
	}
	return nil
}

func ensurePullReady(repo RepoDetail) error {
	if strings.TrimSpace(repo.ScanError) != "" {
		return fmt.Errorf("当前仓库扫描失败，请先刷新或排查后再拉取：\n%s", repo.ScanError)
	}
	if repo.Conflicts > 0 {
		return fmt.Errorf("当前仓库存在 %d 个冲突，不能执行 pull", repo.Conflicts)
	}
	if repo.Modified > 0 || len(repo.Files) > 0 {
		paths := []string{}
		seen := map[string]bool{}
		for _, file := range repo.Files {
			if !seen[file.Path] {
				paths = append(paths, file.Path)
				seen[file.Path] = true
			}
		}
		return fmt.Errorf("当前仓库有本地改动，请先提交或处理后再拉取（%d 个文件）：\n%s", max(repo.Modified, len(paths)), strings.Join(paths, "\n"))
	}
	if repo.Remote == "—" {
		return errors.New("当前分支没有 upstream，无法拉取；请先配置跟踪分支")
	}
	return nil
}

func pullArgs(strategy string) []string {
	switch effectivePullStrategy(strategy) {
	case "rebase":
		return []string{"pull", "--rebase"}
	case "merge":
		return []string{"pull"}
	default:
		return []string{"pull", "--ff-only"}
	}
}

func effectivePullStrategy(strategy string) string {
	if strategy == "" {
		return defaultPullStrategy
	}
	return strategy
}

func effectivePushStrategy(strategy string) string {
	if strategy == "" {
		return defaultPushStrategy
	}
	return strategy
}

func batchOperationName(operation string) string {
	if operation == "push" {
		return "pushAll"
	}
	return "pullAll"
}

func normalizeHistoryLimit(limit int) int {
	if limit <= 0 {
		return defaultHistoryPageSize
	}
	return limit
}

func pageHistoryTotal(offset, count int, hasMore bool) int {
	if hasMore {
		return 0
	}
	return offset + count
}
