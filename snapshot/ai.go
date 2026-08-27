package snapshot

import (
	"bufio"
	"errors"
	"fmt"
	"io"
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
	paths     []string
	pathCount int
	diff      string
}

func (executor gitExecutor) buildAIContext(repo RepoDetail, settings AICommitSettings) (aiContext, error) {
	sourceFiles := filterSourceFiles(repo.Files, settings.StagedOnly)
	if len(sourceFiles) == 0 {
		if settings.StagedOnly {
			return aiContext{}, errors.New("当前没有已暂存变更，无法生成 AI 提交信息")
		}
		return aiContext{}, errors.New("当前没有可用于生成的变更")
	}

	paths, pathCount, diff := executor.buildDiffBlocks(repo.Path, sourceFiles, settings.MaxDiffChars)
	if diff == "" {
		return aiContext{}, errors.New("没有可发送给 AI 的 Diff 内容")
	}
	return aiContext{paths: paths, pathCount: pathCount, diff: diff}, nil
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

func (executor gitExecutor) buildDiffBlocks(repoPath string, files []FileChange, maxChars int) ([]string, int, string) {
	paths, pathCount := uniquePaths(files)
	blocks := []string{}
	totalChars := 0
	limit := maxChars
	if limit <= 0 {
		limit = 12000
	}
	limit = min(limit, maxAIContextChars)
	for _, file := range files {
		diffLines := executor.buildFilePreviewLines(repoPath, file)
		if len(diffLines) == 0 {
			continue
		}
		block := "### [" + stagedLabel(file.Staged) + "] " + file.Path + " (" + file.Status + ")\n" + strings.Join(diffLines, "\n")
		if totalChars+len(block) > limit {
			remaining := max(limit-totalChars, 0)
			const marker = "...[已按设置截断]"
			if remaining > len(marker)+1 {
				blocks = append(blocks, truncateUTF8Prefix(block, remaining-len(marker)-1)+"\n"+marker)
			} else if remaining > 0 {
				blocks = append(blocks, truncateUTF8Prefix(marker, remaining))
			}
			break
		}
		blocks = append(blocks, block)
		totalChars += len(block) + 2
	}
	return paths, pathCount, strings.TrimSpace(strings.Join(blocks, "\n\n"))
}

const maxAIPathListBytes = 16 * 1024

func uniquePaths(files []FileChange) ([]string, int) {
	seen := map[string]bool{}
	paths := []string{}
	pathBytes := 0
	pathCount := 0
	truncated := false
	const truncationMarker = "...[文件列表已截断]"
	for _, file := range files {
		if seen[file.Path] {
			continue
		}
		seen[file.Path] = true
		pathCount++
		if pathBytes+len(file.Path)+3 > maxAIPathListBytes-len(truncationMarker)-3 {
			truncated = true
			continue
		}
		paths = append(paths, file.Path)
		pathBytes += len(file.Path) + 3
	}
	if truncated {
		paths = append(paths, truncationMarker)
	}
	return paths, pathCount
}

const (
	maxAIContextChars     = 20 * 1024
	maxAIFileDiffBytes    = 64 * 1024
	maxAIFilePreviewLines = 160
	maxAIPreviewLineBytes = 8 * 1024
)

func (executor gitExecutor) buildFilePreviewLines(repoPath string, file FileChange) []string {
	if file.Status == "A" && !file.Staged {
		lines := safeReadLines(filepath.Join(repoPath, filepath.FromSlash(file.Path)))
		limit := min(maxAIFilePreviewLines, len(lines))
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
	diff, truncated, err := executor.runGitPreview(repoPath, args, maxAIFileDiffBytes)
	if err != nil {
		return nil
	}
	lines := trimDiffLines(strings.Split(diff, "\n"))
	if truncated {
		lines = append(lines, "...[单文件预览已截断]")
	}
	return lines
}

func safeReadLines(filePath string) []string {
	file, err := os.Open(filePath)
	if err != nil {
		return nil
	}
	defer file.Close()

	reader := bufio.NewReaderSize(file, 32*1024)
	lines := make([]string, 0, maxAIFilePreviewLines)
	lastLineEnded := false
	for len(lines) < maxAIFilePreviewLines {
		line, hasData, ended, readErr := readPreviewLine(reader)
		if readErr != nil && readErr != io.EOF {
			return nil
		}
		if hasData {
			lines = append(lines, line)
		} else if readErr == io.EOF && (len(lines) == 0 || lastLineEnded) {
			// strings.Split preserves the empty final segment of an empty/newline-terminated file.
			lines = append(lines, "")
		}
		if readErr == io.EOF {
			break
		}
		lastLineEnded = ended
	}
	return lines
}

func readPreviewLine(reader *bufio.Reader) (string, bool, bool, error) {
	var line strings.Builder
	truncated := false
	hasData := false
	ended := false
	for {
		fragment, err := reader.ReadSlice('\n')
		if len(fragment) > 0 {
			hasData = true
			fragmentEnded := fragment[len(fragment)-1] == '\n'
			if fragmentEnded {
				fragment = fragment[:len(fragment)-1]
			}
			if line.Len() < maxAIPreviewLineBytes && !truncated {
				remaining := maxAIPreviewLineBytes - line.Len()
				kept := truncateUTF8Prefix(string(fragment), remaining)
				line.WriteString(kept)
				if len(kept) < len(fragment) {
					truncated = true
				}
			} else if len(fragment) > 0 {
				truncated = true
			}
			if fragmentEnded {
				ended = true
			}
		}
		if err == bufio.ErrBufferFull {
			continue
		}
		if err != nil && err != io.EOF {
			return "", false, false, err
		}
		break
	}
	if !hasData {
		return "", false, ended, io.EOF
	}
	value := validUTF8Prefix(line.String())
	if len(value) > maxAIPreviewLineBytes {
		value = truncateUTF8Prefix(value, maxAIPreviewLineBytes)
		truncated = true
	}
	if ended {
		value = strings.TrimSuffix(value, "\r")
	}
	if truncated {
		value += "…[单行已截断]"
	}
	return value, true, ended, nil
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
		fmt.Sprintf("文件数：%d", context.pathCount),
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
