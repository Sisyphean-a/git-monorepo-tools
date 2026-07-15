package snapshot

import (
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"time"
)

var (
	remoteFetchRetryDelays   = []time.Duration{0, 0, 5 * time.Second}
	sleepForRemoteFetchRetry = time.Sleep
	runRemoteFetch           = func(executor gitExecutor, repoPath, remote string) error {
		_, err := executor.runGit(repoPath, []string{"fetch", "--prune", "--quiet", remote})
		return err
	}
)

type parsedStatus struct {
	branch    string
	remote    string
	ahead     int
	behind    int
	conflicts int
	entries   []string
}

func (executor gitExecutor) readStatus(repoPath string) (parsedStatus, error) {
	output, err := executor.runGit(repoPath, []string{"status", "--porcelain=v1", "-b", "--untracked-files=all"})
	return parseStatus(output), err
}

func (executor gitExecutor) loadRepoStatus(repoPath string, refreshRemotes bool) (parsedStatus, error) {
	if refreshRemotes {
		return executor.readStatusAfterRemoteSync(repoPath)
	}
	return executor.readStatus(repoPath)
}

func (executor gitExecutor) readStatusAfterRemoteSync(repoPath string) (parsedStatus, error) {
	parsed, err := executor.readStatus(repoPath)
	if err != nil || parsed.remote == "—" {
		return parsed, err
	}
	if fetchErr := executor.refreshRemoteWithRetry(repoPath, parsed.remote); fetchErr != nil {
		return parsed, fetchErr
	}
	return executor.readStatus(repoPath)
}

func (executor gitExecutor) refreshRemoteWithRetry(repoPath, remote string) error {
	var lastErr error
	for _, delay := range remoteFetchRetryDelays {
		if delay > 0 {
			sleepForRemoteFetchRetry(delay)
		}
		lastErr = runRemoteFetch(executor, repoPath, remote)
		if lastErr == nil {
			return nil
		}
	}
	return lastErr
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

func (executor gitExecutor) buildFileChanges(repoPath string, entries []string) ([]FileChange, error) {
	stagedOutput, stagedErr := executor.runGit(repoPath, []string{"diff", "--cached", "--numstat", "--no-renames"})
	unstagedOutput, unstagedErr := executor.runGit(repoPath, []string{"diff", "--numstat", "--no-renames"})
	changes := buildTrackedChanges(repoPath, parseNumstat(stagedOutput), true)
	changes = append(changes, buildTrackedChanges(repoPath, parseNumstat(unstagedOutput), false)...)
	changes = append(changes, buildUntrackedChanges(repoPath, entries, changes)...)
	slices.SortFunc(changes, compareFileChanges)
	return changes, firstGitError(stagedErr, unstagedErr)
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
			Status: detectStatus(filePath, parts[0], parts[1]), Path: filePath,
			Additions: toNumber(parts[0]), Deletions: toNumber(parts[1]),
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
		filePath := normalizePath(strings.TrimSpace(strings.TrimPrefix(entry, "?? ")))
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
	return changes
}

func extractBranch(line string) string {
	match := regexp.MustCompile(`^## ([^.\s]+)`).FindStringSubmatch(line)
	if len(match) < 2 {
		return "HEAD"
	}
	return match[1]
}

func extractRemote(line string) string {
	match := regexp.MustCompile(`\.\.\.([^ \[]+)`).FindStringSubmatch(line)
	if len(match) < 2 {
		return "—"
	}
	return strings.Split(match[1], "/")[0]
}

func extractCount(line, key string) int {
	match := regexp.MustCompile(key + ` (\d+)`).FindStringSubmatch(line)
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
