package snapshot

import (
	"os"
	"path/filepath"
	"regexp"
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
