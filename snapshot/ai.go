package snapshot

import (
	"bytes"
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

func (s *Service) GenerateCommitCandidates(repoID string, request Request, settings AICommitSettings, styleHint string) ([]CommitCandidate, error) {
	if err := ensureAISettings(settings); err != nil {
		return nil, err
	}
	repo, err := s.resolveRepo(repoID, request)
	if err != nil {
		return nil, err
	}
	context, err := buildAIContext(repo, settings)
	if err != nil {
		return nil, err
	}
	prompt := buildAIPrompt(repo, settings, context, styleHint)
	raw, err := requestAICompletion(settings, prompt)
	if err != nil {
		return nil, err
	}
	return parseAICandidates(raw, styleHint)
}

func ensureAISettings(settings AICommitSettings) error {
	switch {
	case strings.TrimSpace(settings.APIKey) == "":
		return errors.New("请先在设置中填写 AI API 密钥")
	case strings.TrimSpace(settings.BaseURL) == "":
		return errors.New("请先在设置中填写 AI 基础 URL")
	case strings.TrimSpace(settings.Model) == "":
		return errors.New("请先在设置中填写 AI 模型")
	case strings.TrimSpace(settings.PromptTemplate) == "":
		return errors.New("请先在设置中填写 AI 提示词模板")
	default:
		return nil
	}
}

type aiContext struct {
	paths []string
	diff  string
}

func buildAIContext(repo RepoDetail, settings AICommitSettings) (aiContext, error) {
	sourceFiles := filterSourceFiles(repo.Files, settings.StagedOnly)
	if len(sourceFiles) == 0 {
		if settings.StagedOnly {
			return aiContext{}, errors.New("当前没有已暂存变更，无法生成 AI 提交信息")
		}
		return aiContext{}, errors.New("当前没有可用于生成的变更")
	}

	paths, diff := buildDiffBlocks(repo.Path, sourceFiles, settings.MaxDiffChars)
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

func buildDiffBlocks(repoPath string, files []FileChange, maxChars int) ([]string, string) {
	paths := uniquePaths(files)
	blocks := []string{}
	totalChars := 0
	limit := maxChars
	if limit <= 0 {
		limit = 12000
	}
	for _, file := range files {
		diffLines := buildFilePreviewLines(repoPath, file)
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

func buildFilePreviewLines(repoPath string, file FileChange) []string {
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
	diff, err := runGitStrict(repoPath, args)
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

func buildAIPrompt(repo RepoDetail, settings AICommitSettings, context aiContext, styleHint string) string {
	requestedCount := 1
	if styleHint == "" && settings.GenerateThree {
		requestedCount = 3
	}
	lines := []string{
		strings.TrimSpace(settings.PromptTemplate),
		"",
		"仓库：" + repo.Name,
		"分支：" + repo.Branch,
		"变更来源：" + aiSourceLabel(settings.StagedOnly),
		fmt.Sprintf("文件数：%d", len(context.paths)),
		"文件列表：" + strings.Join(context.paths, ", "),
		fmt.Sprintf("候选数量：%d", requestedCount),
		aiInstruction(styleHint, requestedCount),
		"输出必须是 JSON，结构如下：",
		"{\"candidates\":[{\"style\":\"风格名\",\"icon\":\"单个 emoji\",\"title\":\"提交标题\",\"body\":\"一句中文说明\",\"full\":\"完整提交信息\"}]}",
		"不要输出 Markdown 代码块，不要输出 JSON 之外的文字。",
		"",
		"Diff：",
		context.diff,
	}
	return strings.Join(lines, "\n")
}

func aiSourceLabel(stagedOnly bool) string {
	if stagedOnly {
		return "仅已暂存变更"
	}
	return "全部变更"
}

func aiInstruction(styleHint string, requestedCount int) string {
	if styleHint != "" {
		return fmt.Sprintf("只生成 1 条「%s」风格候选。", styleHint)
	}
	if requestedCount == 3 {
		return "依次返回 3 条候选：表情风格、标准短句、约定式提交。"
	}
	return "返回 1 条最合适的约定式提交候选。"
}

func requestAICompletion(settings AICommitSettings, prompt string) (string, error) {
	payload := map[string]any{
		"model":       settings.Model,
		"temperature": 0.2,
		"messages": []map[string]string{
			{"role": "system", "content": "你是 Git 提交信息生成器。请严格按照用户要求输出 JSON。"},
			{"role": "user", "content": prompt},
		},
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	response, err := http.DefaultClient.Do(newAIRequest(settings, body))
	if err != nil {
		return "", err
	}
	defer response.Body.Close()
	return parseAIResponse(response)
}

func newAIRequest(settings AICommitSettings, body []byte) *http.Request {
	request, _ := http.NewRequest(http.MethodPost, strings.TrimRight(settings.BaseURL, "/")+"/chat/completions", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Authorization", "Bearer "+settings.APIKey)
	return request
}

func parseAIResponse(response *http.Response) (string, error) {
	rawBody, err := io.ReadAll(response.Body)
	if err != nil {
		return "", err
	}
	var payload map[string]any
	_ = json.Unmarshal(rawBody, &payload)
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		if message := nestedString(payload, "error", "message"); message != "" {
			return "", errors.New(message)
		}
		text := strings.TrimSpace(string(rawBody))
		if text == "" {
			text = "AI 服务调用失败"
		}
		return "", errors.New(text)
	}
	content := nestedString(payload, "choices", "0", "message", "content")
	if strings.TrimSpace(content) == "" {
		return "", errors.New("AI 未返回提交候选")
	}
	return content, nil
}

func nestedString(value any, path ...string) string {
	current := value
	for _, key := range path {
		switch typed := current.(type) {
		case map[string]any:
			current = typed[key]
		case []any:
			if key != "0" || len(typed) == 0 {
				return ""
			}
			current = typed[0]
		default:
			return ""
		}
	}
	result, _ := current.(string)
	return result
}

func parseAICandidates(raw, styleHint string) ([]CommitCandidate, error) {
	var payload struct {
		Candidates []map[string]any `json:"candidates"`
	}
	block, err := extractJSONBlock(raw)
	if err != nil {
		return nil, err
	}
	if err := json.Unmarshal([]byte(block), &payload); err != nil {
		return nil, err
	}
	if len(payload.Candidates) == 0 {
		return nil, errors.New("AI 返回的候选为空")
	}
	candidates := make([]CommitCandidate, 0, len(payload.Candidates))
	for index, candidate := range payload.Candidates {
		candidates = append(candidates, normalizeAICandidate(candidate, index, styleHint))
	}
	return candidates, nil
}

func extractJSONBlock(raw string) (string, error) {
	fencedStart := strings.Index(raw, "```json")
	if fencedStart >= 0 {
		after := raw[fencedStart+7:]
		fencedEnd := strings.Index(after, "```")
		if fencedEnd >= 0 {
			return strings.TrimSpace(after[:fencedEnd]), nil
		}
	}
	start := strings.Index(raw, "{")
	end := strings.LastIndex(raw, "}")
	if start == -1 || end <= start {
		return "", errors.New("AI 返回内容不是合法 JSON")
	}
	return raw[start : end+1], nil
}

func normalizeAICandidate(candidate map[string]any, index int, styleHint string) CommitCandidate {
	style := fallbackString(styleHint, trimmedValue(candidate["style"]), fmt.Sprintf("AI 候选 %d", index+1))
	title := fallbackString(trimmedValue(candidate["title"]), "chore: 更新变更")
	full := fallbackString(trimmedValue(candidate["full"]), title)
	body := fallbackString(trimmedValue(candidate["body"]), "基于真实 Git Diff 生成")
	icon := fallbackString(trimmedValue(candidate["icon"]), "✨")
	sum := sha1.Sum([]byte(fmt.Sprintf("%s-%s-%s-%d", style, title, full, index)))
	return CommitCandidate{
		ID:    "ai-" + hex.EncodeToString(sum[:])[:8],
		Style: style,
		Icon:  icon,
		Title: title,
		Body:  body,
		Full:  full,
	}
}

func trimmedValue(value any) string {
	text, _ := value.(string)
	return strings.TrimSpace(text)
}

func fallbackString(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}
