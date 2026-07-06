package snapshot

import (
	"bytes"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"
)

var nonAlphaNum = regexp.MustCompile(`[^a-z0-9]+`)

type parsedStatus struct {
	branch    string
	remote    string
	ahead     int
	behind    int
	conflicts int
	entries   []string
}

func runGit(repoPath string, args []string) (string, error) {
	cmd := exec.Command("git", append([]string{"-C", repoPath}, args...)...)
	applyBackgroundProcessAttrs(cmd)
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return "", buildGitError(args, stdout.String(), stderr.String())
	}
	return strings.TrimSpace(stdout.String()), nil
}

func readStatus(repoPath string) (parsedStatus, error) {
	output, err := runGit(repoPath, []string{"status", "--porcelain=v1", "-b"})
	return parseStatus(output), err
}

func readStatusAfterRemoteSync(repoPath string) (parsedStatus, error) {
	parsed, err := readStatus(repoPath)
	if err != nil || parsed.remote == "—" {
		return parsed, err
	}
	if _, fetchErr := runGit(repoPath, []string{"fetch", "--prune", "--quiet", parsed.remote}); fetchErr != nil {
		return parsed, fetchErr
	}
	return readStatus(repoPath)
}

func parseStatus(output string) parsedStatus {
	lines := filterNonEmpty(strings.Split(output, "\n"))
	branchLine := "## HEAD"
	if len(lines) > 0 {
		branchLine = strings.TrimSpace(lines[0])
	}
	entries := []string{}
	if len(lines) > 1 {
		entries = lines[1:]
	}
	return parsedStatus{
		branch:    extractBranch(branchLine),
		remote:    extractRemote(branchLine),
		ahead:     extractCount(branchLine, "ahead"),
		behind:    extractCount(branchLine, "behind"),
		conflicts: countConflicts(entries),
		entries:   entries,
	}
}

func buildFileChanges(repoPath string, entries []string) ([]FileChange, error) {
	stagedOutput, stagedErr := runGit(repoPath, []string{"diff", "--cached", "--numstat", "--no-renames"})
	unstagedOutput, unstagedErr := runGit(repoPath, []string{"diff", "--numstat", "--no-renames"})
	stagedStats := parseNumstat(stagedOutput)
	unstagedStats := parseNumstat(unstagedOutput)
	changes := buildTrackedChanges(repoPath, stagedStats, true)
	changes = append(changes, buildTrackedChanges(repoPath, unstagedStats, false)...)
	changes = append(changes, buildUntrackedChanges(repoPath, entries, changes)...)
	slices.SortFunc(changes, compareFileChanges)
	return changes, firstGitError(stagedErr, unstagedErr)
}

func buildHistory(repoPath string) ([]CommitSummary, error) {
	output, err := runGit(repoPath, []string{"log", "-5", "--numstat", "--format=%H%x1f%h%x1f%an%x1f%ar%x1f%s"})
	if isNoCommitHistoryError(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(output) == "" {
		return nil, nil
	}
	lines := filterNonEmpty(strings.Split(output, "\n"))
	history := make([]CommitSummary, 0, len(lines))
	var currentCommit *CommitSummary
	for _, line := range lines {
		if strings.Contains(line, "\x1f") {
			if currentCommit != nil {
				history = append(history, *currentCommit)
			}
			commit, ok := parseHistoryCommit(line)
			if !ok {
				currentCommit = nil
				continue
			}
			currentCommit = &commit
			continue
		}
		if currentCommit == nil {
			continue
		}
		additions, deletions, ok := parseNumstatLine(line)
		if !ok {
			continue
		}
		currentCommit.Additions += additions
		currentCommit.Deletions += deletions
	}
	if currentCommit != nil {
		history = append(history, *currentCommit)
	}
	return history, nil
}

func parseHistoryCommit(line string) (CommitSummary, bool) {
	parts := strings.Split(line, "\x1f")
	if len(parts) < 5 {
		return CommitSummary{}, false
	}
	return CommitSummary{
		Hash:      parts[0],
		ShortHash: parts[1],
		Author:    parts[2],
		Time:      parts[3],
		Message:   parts[4],
	}, true
}

func parseNumstatLine(line string) (int, int, bool) {
	parts := strings.Split(line, "\t")
	if len(parts) != 3 {
		return 0, 0, false
	}
	return toNumber(parts[0]), toNumber(parts[1]), true
}

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

func parseNumstat(output string) map[string]FileChange {
	stats := map[string]FileChange{}
	for _, line := range filterNonEmpty(strings.Split(output, "\n")) {
		parts := strings.Split(line, "\t")
		if len(parts) != 3 {
			continue
		}
		filePath := normalizePath(parts[2])
		stats[filePath] = FileChange{
			Status:    detectStatus(filePath, parts[0], parts[1]),
			Path:      filePath,
			Additions: toNumber(parts[0]),
			Deletions: toNumber(parts[1]),
		}
	}
	return stats
}

func buildTrackedChanges(repoPath string, stats map[string]FileChange, staged bool) []FileChange {
	changes := make([]FileChange, 0, len(stats))
	for _, stat := range stats {
		stat.ID = stat.Path + "::" + stagedLabel(staged)
		stat.Size = formatSize(resolveSize(filepath.Join(repoPath, stat.Path)))
		stat.Staged = staged
		changes = append(changes, stat)
	}
	return changes
}

func buildUntrackedChanges(repoPath string, entries []string, existing []FileChange) []FileChange {
	seen := map[string]bool{}
	for _, item := range existing {
		seen[item.ID] = true
	}
	changes := []FileChange{}
	for _, entry := range entries {
		if !strings.HasPrefix(entry, "?? ") {
			continue
		}
		for _, filePath := range expandUntracked(repoPath, strings.TrimSpace(strings.TrimPrefix(entry, "?? "))) {
			id := filePath + "::unstaged"
			if seen[id] {
				continue
			}
			seen[id] = true
			absolute := filepath.Join(repoPath, filepath.FromSlash(filePath))
			changes = append(changes, FileChange{
				ID: id, Status: "A", Path: filePath, Additions: countFileLines(absolute),
				Deletions: 0, Size: formatSize(resolveSize(absolute)), Staged: false,
			})
		}
	}
	return changes
}

func expandUntracked(repoPath, rawPath string) []string {
	absolute := filepath.Join(repoPath, filepath.FromSlash(rawPath))
	info, err := os.Stat(absolute)
	if err != nil || !info.IsDir() {
		return []string{normalizePath(rawPath)}
	}
	return listFiles(repoPath, absolute)
}

func listFiles(repoPath, rootPath string) []string {
	files := []string{}
	entries, err := os.ReadDir(rootPath)
	if err != nil {
		return files
	}
	for _, entry := range entries {
		absolute := filepath.Join(rootPath, entry.Name())
		if entry.IsDir() {
			files = append(files, listFiles(repoPath, absolute)...)
			continue
		}
		relative, relErr := filepath.Rel(repoPath, absolute)
		if relErr == nil {
			files = append(files, normalizePath(relative))
		}
	}
	return files
}

func extractBranch(line string) string {
	pattern := regexp.MustCompile(`^## ([^.\s]+)`)
	match := pattern.FindStringSubmatch(line)
	if len(match) < 2 {
		return "HEAD"
	}
	return match[1]
}

func extractRemote(line string) string {
	pattern := regexp.MustCompile(`\.\.\.([^ \[]+)`)
	match := pattern.FindStringSubmatch(line)
	if len(match) < 2 {
		return "—"
	}
	parts := strings.Split(match[1], "/")
	return parts[0]
}

func extractCount(line, key string) int {
	pattern := regexp.MustCompile(key + ` (\d+)`)
	match := pattern.FindStringSubmatch(line)
	if len(match) < 2 {
		return 0
	}
	return toNumber(match[1])
}

func countConflicts(entries []string) int {
	count := 0
	for _, entry := range entries {
		code := ""
		if len(entry) >= 2 {
			code = entry[:2]
		}
		if slices.Contains([]string{"DD", "AU", "UD", "UA", "DU", "AA", "UU"}, code) {
			count++
		}
	}
	return count
}

func detectStatus(filePath, added, deleted string) string {
	if added == "0" {
		return "D"
	}
	if deleted == "0" {
		return "A"
	}
	if strings.Contains(filePath, " -> ") {
		return "R"
	}
	return "M"
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
	limit := min(3, len(pairs))
	scopes := make([]string, 0, limit)
	for i := 0; i < limit; i++ {
		scopes = append(scopes, pairs[i].key)
	}
	return scopes
}

func compareFileChanges(left, right FileChange) int {
	if left.Staged != right.Staged {
		if left.Staged {
			return -1
		}
		return 1
	}
	return strings.Compare(left.Path, right.Path)
}

func resolveSize(filePath string) int64 {
	info, err := os.Stat(filePath)
	if err != nil || info.IsDir() {
		return 0
	}
	return info.Size()
}

func countFileLines(filePath string) int {
	content, err := os.ReadFile(filePath)
	if err != nil || len(content) == 0 {
		return 0
	}
	return len(strings.Split(strings.ReplaceAll(string(content), "\r\n", "\n"), "\n"))
}

func uniquePathCount(files []FileChange) int {
	seen := map[string]bool{}
	for _, file := range files {
		seen[file.Path] = true
	}
	return len(seen)
}

func repoStatus(scanError string, conflicts, modified int) string {
	if scanError != "" {
		return "error"
	}
	if conflicts > 0 {
		return "conflict"
	}
	if modified > 0 {
		return "changed"
	}
	return "clean"
}

func firstGitError(errors ...error) error {
	for _, err := range errors {
		if err != nil {
			return err
		}
	}
	return nil
}

func buildGitError(args []string, stdout, stderr string) error {
	message := strings.TrimSpace(stderr)
	if message == "" {
		message = strings.TrimSpace(stdout)
	}
	if message == "" {
		message = "git " + strings.Join(args, " ") + " 失败"
	}
	return errors.New(message)
}

func isNoCommitHistoryError(err error) bool {
	return err != nil && strings.Contains(err.Error(), "does not have any commits yet")
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
		if seen[item.repo.Category] {
			continue
		}
		seen[item.repo.Category] = true
		categories = append(categories, item.repo.Category)
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
		trimmed := strings.TrimSpace(line)
		if trimmed != "" {
			filtered = append(filtered, trimmed)
		}
	}
	return filtered
}

func extractShortstat(line, pattern string) int {
	re := regexp.MustCompile(pattern)
	match := re.FindStringSubmatch(line)
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
