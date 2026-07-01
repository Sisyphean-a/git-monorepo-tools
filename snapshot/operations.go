package snapshot

import (
	"bytes"
	"errors"
	"fmt"
	"os/exec"
	"strings"
	"time"
)

func (s *Service) MutateRepo(repoID, action string, request Request, body RepoActionRequest) (AppSnapshot, error) {
	repo, err := s.resolveRepo(repoID, request)
	if err != nil {
		return AppSnapshot{}, err
	}
	if err := mutateRepo(repo, action, request, body); err != nil {
		return AppSnapshot{}, err
	}
	return s.BuildAppSnapshot(request)
}

func (s *Service) RunBatch(operation string, request Request) (BatchResult, error) {
	snapshot, err := s.BuildAppSnapshot(request)
	if err != nil {
		return BatchResult{}, err
	}
	results, err := runBatch(snapshot, operation, request)
	if err != nil {
		return BatchResult{}, err
	}
	updated, err := s.buildSnapshot(request, results)
	if err != nil {
		return BatchResult{}, err
	}
	return BatchResult{Snapshot: updated, Results: results, Operation: batchOperationName(operation)}, nil
}

func (s *Service) GetRepoLog(repoID string, request Request) (RepoLog, error) {
	repo, err := s.resolveRepo(repoID, request)
	if err != nil {
		return RepoLog{}, err
	}
	content, err := runGitStrict(repo.Path, []string{"log", "--decorate", "--stat", "-10"})
	if err != nil {
		return RepoLog{}, err
	}
	if content == "" {
		content = "暂无日志内容"
	}
	return RepoLog{RepoID: repo.ID, RepoName: repo.Name, Path: repo.Path, Content: content}, nil
}

func (s *Service) resolveRepo(repoID string, request Request) (RepoDetail, error) {
	scanTime := time.Now()
	for _, entry := range s.discoverRepos(s.buildRoots(request)) {
		snapshot, err := buildRepoSnapshot(entry, scanTime)
		if err != nil {
			continue
		}
		if snapshot.repo.ID == repoID {
			return snapshot.detail, nil
		}
	}
	return RepoDetail{}, fmt.Errorf("未找到仓库：%s", repoID)
}

func mutateRepo(repo RepoDetail, action string, request Request, body RepoActionRequest) error {
	switch action {
	case "stage-all":
		_, err := runGitStrict(repo.Path, []string{"add", "-A"})
		return err
	case "unstage-all":
		_, err := runGitStrict(repo.Path, []string{"restore", "--staged", "."})
		return err
	case "stage-file":
		filePath, err := parseFilePath(body)
		if err != nil {
			return err
		}
		_, err = runGitStrict(repo.Path, []string{"add", "--", filePath})
		return err
	case "unstage-file":
		filePath, err := parseFilePath(body)
		if err != nil {
			return err
		}
		_, err = runGitStrict(repo.Path, []string{"restore", "--staged", "--", filePath})
		return err
	case "commit":
		if err := ensureCommitMessage(body.Message); err != nil {
			return err
		}
		_, err := runGitStrict(repo.Path, []string{"commit", "-m", body.Message})
		return err
	case "pull":
		if err := ensurePullReady(repo); err != nil {
			return err
		}
		_, err := runGitStrict(repo.Path, pullArgs(request.PullStrategy))
		return err
	case "push":
		if repo.Remote == "—" {
			return errors.New("当前分支没有 upstream，暂不支持自动 push")
		}
		_, err := runGitStrict(repo.Path, []string{"push"})
		return err
	default:
		return fmt.Errorf("未找到操作：%s", action)
	}
}

func runBatch(snapshot AppSnapshot, operation string, request Request) ([]PullResult, error) {
	results := make([]PullResult, 0, len(snapshot.Repos))
	for _, repo := range snapshot.Repos {
		detail, ok := snapshot.RepoDetails[repo.ID]
		if !ok {
			continue
		}
		switch operation {
		case "pull":
			results = append(results, executePullAll(detail, request.PullStrategy))
		case "push":
			results = append(results, executePushAll(detail, request.PushStrategy))
		default:
			return nil, fmt.Errorf("未找到批量操作：%s", operation)
		}
	}
	return results, nil
}

func executePullAll(repo RepoDetail, strategy string) PullResult {
	if repo.Remote == "—" {
		return PullResult{ID: repo.ID, Name: repo.Name, Path: repo.Path, Result: "skipped", Detail: "跳过：当前分支没有 upstream"}
	}
	if repo.Ahead > 0 && repo.Behind > 0 {
		return PullResult{ID: repo.ID, Name: repo.Name, Path: repo.Path, Result: "skipped", Detail: "跳过：当前分支与远端已分叉"}
	}
	if repo.Conflicts > 0 {
		return PullResult{ID: repo.ID, Name: repo.Name, Path: repo.Path, Result: "failed", Detail: "检测到冲突，需先人工处理"}
	}
	if len(repo.Files) > 0 {
		return PullResult{ID: repo.ID, Name: repo.Name, Path: repo.Path, Result: "skipped", Detail: "跳过：存在本地未提交改动"}
	}
	if repo.Behind == 0 {
		return PullResult{ID: repo.ID, Name: repo.Name, Path: repo.Path, Result: "uptodate", Detail: "工作区干净，已与远端同步"}
	}
	if _, err := runGitStrict(repo.Path, pullArgs(strategy)); err != nil {
		return PullResult{ID: repo.ID, Name: repo.Name, Path: repo.Path, Result: "failed", Detail: err.Error()}
	}
	return PullResult{ID: repo.ID, Name: repo.Name, Path: repo.Path, Result: "pulled", Detail: fmt.Sprintf("已拉取 %d 个提交", repo.Behind), Commits: repo.Behind}
}

func executePushAll(repo RepoDetail, strategy string) PullResult {
	if repo.Remote == "—" {
		return PullResult{ID: repo.ID, Name: repo.Name, Path: repo.Path, Result: "skipped", Detail: "跳过：当前分支没有 upstream"}
	}
	if effectivePushStrategy(strategy) == "upstream-only" && repo.Ahead == 0 {
		return PullResult{ID: repo.ID, Name: repo.Name, Path: repo.Path, Result: "uptodate", Detail: "没有需要推送的提交"}
	}
	if repo.Ahead == 0 {
		return PullResult{ID: repo.ID, Name: repo.Name, Path: repo.Path, Result: "uptodate", Detail: "没有需要推送的提交"}
	}
	if _, err := runGitStrict(repo.Path, []string{"push"}); err != nil {
		return PullResult{ID: repo.ID, Name: repo.Name, Path: repo.Path, Result: "failed", Detail: err.Error()}
	}
	return PullResult{ID: repo.ID, Name: repo.Name, Path: repo.Path, Result: "pushed", Detail: fmt.Sprintf("已推送 %d 个提交", repo.Ahead), Commits: repo.Ahead}
}

func runGitStrict(repoPath string, args []string) (string, error) {
	cmd := exec.Command("git", append([]string{"-C", repoPath}, args...)...)
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		message := strings.TrimSpace(stderr.String())
		if message == "" {
			message = strings.TrimSpace(stdout.String())
		}
		if message == "" {
			return "", fmt.Errorf("git %s 失败", strings.Join(args, " "))
		}
		return "", errors.New(message)
	}
	return strings.TrimSpace(stdout.String()), nil
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
	if repo.Conflicts > 0 {
		return errors.New("当前仓库存在冲突，不能执行 pull")
	}
	if len(repo.Files) > 0 {
		return errors.New("当前仓库有本地改动，请先提交或处理后再拉取")
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
