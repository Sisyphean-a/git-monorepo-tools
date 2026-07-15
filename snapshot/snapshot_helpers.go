package snapshot

import (
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"
)

var nonAlphaNum = regexp.MustCompile(`[^a-z0-9]+`)

func buildPullResult(repo Repo, repoPath string) PullResult {
	if repo.ScanError != "" {
		return PullResult{ID: repo.ID, Name: repo.Name, Path: repoPath, Result: "failed", Detail: "仓库扫描失败：" + repo.ScanError}
	}
	if repo.Conflicts > 0 {
		return PullResult{ID: repo.ID, Name: repo.Name, Path: repoPath, Result: "failed", Detail: "检测到冲突，需先人工处理"}
	}
	if repo.Modified > 0 {
		return PullResult{ID: repo.ID, Name: repo.Name, Path: repoPath, Result: "skipped", Detail: "跳过：存在本地未提交改动"}
	}
	if repo.Behind > 0 {
		return PullResult{ID: repo.ID, Name: repo.Name, Path: repoPath, Result: "skipped", Detail: "可执行 pull --ff-only：落后远端 " + strconv.Itoa(repo.Behind) + " 个提交", Commits: repo.Behind}
	}
	if repo.Ahead > 0 {
		return PullResult{ID: repo.ID, Name: repo.Name, Path: repoPath, Result: "uptodate", Detail: "本地领先远端 " + strconv.Itoa(repo.Ahead) + " 个提交", Commits: repo.Ahead}
	}
	return PullResult{ID: repo.ID, Name: repo.Name, Path: repoPath, Result: "uptodate", Detail: "工作区干净，已与远端同步"}
}

func buildCommitCandidates(files []FileChange) []CommitCandidate {
	staged := []FileChange{}
	for _, file := range files {
		if file.Staged {
			staged = append(staged, file)
		}
	}
	if len(staged) == 0 {
		return nil
	}
	scopes := topScopes(staged)
	summary := strings.Join(scopes, ", ")
	total := len(staged)
	scope := scopes[0]
	return []CommitCandidate{
		{ID: "emoji", Style: "表情风格", Icon: "✨", Title: "feat(" + scope + "): 更新 " + summary, Body: "基于 " + strconv.Itoa(total) + " 个暂存文件生成", Full: "✨ feat(" + scope + "): 更新 " + summary},
		{ID: "short", Style: "标准短句", Icon: "📝", Title: scope + ": 更新 " + strconv.Itoa(total) + " 个暂存文件", Body: "基于 " + strconv.Itoa(total) + " 个暂存文件生成", Full: scope + ": 更新 " + strconv.Itoa(total) + " 个暂存文件"},
		{ID: "conventional", Style: "约定式提交", Icon: "📐", Title: "chore(" + scope + "): 更新暂存区改动", Body: "基于 " + strconv.Itoa(total) + " 个暂存文件生成", Full: "chore(" + scope + "): 更新暂存区改动"},
	}
}

func topScopes(files []FileChange) []string {
	counter := map[string]int{}
	for _, file := range files {
		scope := strings.Split(file.Path, "/")[0]
		if scope == "" {
			scope = "repo"
		}
		counter[scope]++
	}
	type pair struct {
		key   string
		value int
	}
	pairs := make([]pair, 0, len(counter))
	for key, value := range counter {
		pairs = append(pairs, pair{key: key, value: value})
	}
	slices.SortFunc(pairs, func(left, right pair) int {
		if left.value != right.value {
			return right.value - left.value
		}
		return strings.Compare(left.key, right.key)
	})
	scopes := make([]string, 0, min(3, len(pairs)))
	for i := 0; i < min(3, len(pairs)); i++ {
		scopes = append(scopes, pairs[i].key)
	}
	return scopes
}

func uniquePathCount(files []FileChange) int {
	seen := map[string]bool{}
	for _, file := range files {
		seen[file.Path] = true
	}
	return len(seen)
}

func countStaged(files []FileChange, staged bool) int {
	total := 0
	for _, file := range files {
		if file.Staged == staged {
			total++
		}
	}
	return total
}

func uniqueCategories(items []repoSnapshot) []string {
	seen := map[string]bool{}
	categories := []string{}
	for _, item := range items {
		if !seen[item.repo.Category] {
			seen[item.repo.Category] = true
			categories = append(categories, item.repo.Category)
		}
	}
	return categories
}

func orderedDetails(items []repoSnapshot) []RepoDetail {
	repos := make([]RepoDetail, 0, len(items))
	for _, item := range items {
		repos = append(repos, item.detail)
	}
	return repos
}

func orderedDetailsMap(items []repoSnapshot) map[string]RepoDetail {
	details := map[string]RepoDetail{}
	for _, item := range items {
		details[item.repo.ID] = item.detail
	}
	return details
}

func orderedPullResults(items []repoSnapshot) []PullResult {
	results := make([]PullResult, 0, len(items))
	for _, item := range items {
		results = append(results, item.pullResult)
	}
	return results
}

func orderedCandidates(items []repoSnapshot) map[string][]CommitCandidate {
	candidates := map[string][]CommitCandidate{}
	for _, item := range items {
		candidates[item.repo.ID] = item.commitCandidates
	}
	return candidates
}

func normalizePath(value string) string {
	return strings.ReplaceAll(value, "\\", "/")
}

func formatSize(size int64) string {
	if size <= 0 {
		return "—"
	}
	if size < 1024 {
		return strconv.FormatInt(size, 10) + " B"
	}
	if size < 1024*1024 {
		return strconv.FormatFloat(float64(size)/1024, 'f', 1, 64) + " KB"
	}
	return strconv.FormatFloat(float64(size)/(1024*1024), 'f', 1, 64) + " MB"
}

func formatTime(value time.Time) string {
	return value.Format("15:04:05")
}

func formatDateTime(value time.Time) string {
	return value.Format("2006/1/2 15:04:05")
}

func pathExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func isGitRepo(path string) bool {
	return pathExists(filepath.Join(path, ".git"))
}

func filterNonEmpty(lines []string) []string {
	filtered := []string{}
	for _, line := range lines {
		if trimmed := strings.TrimSpace(line); trimmed != "" {
			filtered = append(filtered, trimmed)
		}
	}
	return filtered
}

func extractShortstat(line, pattern string) int {
	match := regexp.MustCompile(pattern).FindStringSubmatch(line)
	if len(match) < 2 {
		return 0
	}
	return toNumber(match[1])
}

func toNumber(value string) int {
	number, err := strconv.Atoi(value)
	if err != nil {
		return 0
	}
	return number
}

func stagedLabel(staged bool) string {
	if staged {
		return "staged"
	}
	return "unstaged"
}
