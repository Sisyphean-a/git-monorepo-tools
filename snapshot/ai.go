package snapshot

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

func (s *Service) GenerateCommitMessage(repoID string, request Request, settings AICommitSettings) (string, error) {
	if err := ensureAISettings(settings); err != nil {
		return "", err
	}
	repo, err := s.resolveRepo(repoID, request)
	if err != nil {
		return "", err
	}
	context, err := newGitExecutor(request).buildAIContext(repo, settings)
	if err != nil {
		return "", err
	}
	raw, err := requestAICompletion(settings, buildAIRequestContent(repo, settings, context))
	if err != nil {
		return "", err
	}
	return extractCommitMessage(raw)
}

func ensureAISettings(settings AICommitSettings) error {
	switch {
	case strings.TrimSpace(settings.APIKey) == "":
		return errors.New("请先在设置中填写 AI API 密钥")
	case strings.TrimSpace(settings.BaseURL) == "":
		return errors.New("请先在设置中填写 AI 基础 URL")
	case strings.TrimSpace(settings.Model) == "":
		return errors.New("请先在设置中填写 AI 模型")
	default:
		return nil
	}
}

type aiContext struct {
	paths []string
	diff  string
}

func (executor gitExecutor) buildAIContext(repo RepoDetail, settings AICommitSettings) (aiContext, error) {
	sourceFiles := filterSourceFiles(repo.Files, settings.StagedOnly)
	if len(sourceFiles) == 0 {
		if settings.StagedOnly {
			return aiContext{}, errors.New("当前没有已暂存变更，无法生成 AI 提交信息")
		}
		return aiContext{}, errors.New("当前没有可用于生成的变更")
	}

	paths, diff := executor.buildDiffBlocks(repo.Path, sourceFiles, settings.MaxDiffChars)
	if diff == "" {
		return aiContext{}, errors.New("没有可发送给 AI 的 Diff 内容")
	}
	return aiContext{paths: paths, diff: diff}, nil
}

func filterSourceFiles(files []FileChange, stagedOnly bool) []FileChange {
	filtered := []FileChange{}
	for _, file := range files {
		if stagedOnly && !file.Staged {
			continue
		}
		filtered = append(filtered, file)
	}
	return filtered
}

func (executor gitExecutor) buildDiffBlocks(repoPath string, files []FileChange, maxChars int) ([]string, string) {
	paths := uniquePaths(files)
	blocks := []string{}
	totalChars := 0
	limit := maxChars
	if limit <= 0 {
		limit = 12000
	}
	for _, file := range files {
		diffLines := executor.buildFilePreviewLines(repoPath, file)
		if len(diffLines) == 0 {
			continue
		}
		block := "### [" + stagedLabel(file.Staged) + "] " + file.Path + " (" + file.Status + ")\n" + strings.Join(diffLines, "\n")
		if totalChars+len(block) > limit {
			remaining := max(limit-totalChars, 0)
			if remaining > 0 {
				blocks = append(blocks, block[:remaining]+"\n...[已按设置截断]")
			}
			break
		}
		blocks = append(blocks, block)
		totalChars += len(block) + 2
	}
	return paths, strings.TrimSpace(strings.Join(blocks, "\n\n"))
}

func uniquePaths(files []FileChange) []string {
	seen := map[string]bool{}
	paths := []string{}
	for _, file := range files {
		if seen[file.Path] {
			continue
		}
		seen[file.Path] = true
		paths = append(paths, file.Path)
	}
	return paths
}

func (executor gitExecutor) buildFilePreviewLines(repoPath string, file FileChange) []string {
	if file.Status == "A" && !file.Staged {
		lines := safeReadLines(filepath.Join(repoPath, filepath.FromSlash(file.Path)))
		limit := min(160, len(lines))
		result := []string{fmt.Sprintf("@@ -0,0 +1,%d @@", limit)}
		for _, line := range lines[:limit] {
			result = append(result, "+"+line)
		}
		return result
	}
	args := []string{"diff", "--no-color", "--", file.Path}
	if file.Staged {
		args = []string{"diff", "--cached", "--no-color", "--", file.Path}
	}
	diff, err := executor.runGit(repoPath, args)
	if err != nil {
		return nil
	}
	return trimDiffLines(strings.Split(diff, "\n"))
}

func safeReadLines(filePath string) []string {
	content, err := os.ReadFile(filePath)
	if err != nil {
		return nil
	}
	return strings.Split(strings.ReplaceAll(string(content), "\r\n", "\n"), "\n")
}

func trimDiffLines(lines []string) []string {
	trimmed := []string{}
	for _, line := range lines {
		if line == "" ||
			strings.HasPrefix(line, "diff --git") ||
			strings.HasPrefix(line, "index ") ||
			strings.HasPrefix(line, "--- ") ||
			strings.HasPrefix(line, "+++ ") {
			continue
		}
		trimmed = append(trimmed, line)
		if len(trimmed) == 240 {
			break
		}
	}
	return trimmed
}

func buildAIRequestContent(repo RepoDetail, settings AICommitSettings, context aiContext) string {
	lines := []string{
		"请基于以下仓库变更生成提交信息：",
		"仓库：" + repo.Name,
		"分支：" + repo.Branch,
		"变更来源：" + aiSourceLabel(settings.StagedOnly),
		fmt.Sprintf("文件数：%d", len(context.paths)),
		"文件列表：",
	}
	for _, path := range context.paths {
		lines = append(lines, "- "+path)
	}
	lines = append(lines, "", "Diff：", context.diff)
	return strings.Join(lines, "\n")
}

func aiSourceLabel(stagedOnly bool) string {
	if stagedOnly {
		return "仅已暂存变更"
	}
	return "全部变更"
}
