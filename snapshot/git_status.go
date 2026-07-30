package snapshot

import (
	"fmt"
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
	output, err := executor.runGitRaw(repoPath, []string{"status", "--porcelain=v1", "-b", "-z", "--untracked-files=all"})
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
	records := strings.Split(output, "\x00")
	if !strings.Contains(output, "\x00") {
		records = strings.Split(output, "\n")
	}
	branchLine := "## HEAD"
	entries := []string{}
	for _, record := range records {
		if strings.TrimSpace(record) == "" {
			continue
		}
		if strings.HasPrefix(record, "## ") {
			branchLine = strings.TrimSpace(record)
			continue
		}
		entries = append(entries, record)
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
	stagedStatsOutput, stagedStatsErr := executor.runGitRaw(repoPath, []string{"diff", "--cached", "--numstat", "-z", "--no-renames"})
	stagedStatusOutput, stagedStatusErr := executor.runGitRaw(repoPath, []string{"diff", "--cached", "--name-status", "-z", "--no-renames"})
	unstagedStatsOutput, unstagedStatsErr := executor.runGitRaw(repoPath, []string{"diff", "--numstat", "-z", "--no-renames"})
	unstagedStatusOutput, unstagedStatusErr := executor.runGitRaw(repoPath, []string{"diff", "--name-status", "-z", "--no-renames"})

	stagedStats, stagedParseErr := parseNumstat(stagedStatsOutput, parseNameStatus(stagedStatusOutput))
	unstagedStats, unstagedParseErr := parseNumstat(unstagedStatsOutput, parseNameStatus(unstagedStatusOutput))
	changes := buildTrackedChanges(repoPath, stagedStats, true)
	changes = append(changes, buildTrackedChanges(repoPath, unstagedStats, false)...)
	changes = append(changes, buildUntrackedChanges(repoPath, entries, changes)...)
	slices.SortFunc(changes, compareFileChanges)
	return changes, firstGitError(
		stagedStatsErr, stagedStatusErr, unstagedStatsErr, unstagedStatusErr,
		stagedParseErr, unstagedParseErr,
	)
}

func parseNumstat(output string, statuses map[string]string) (map[string]FileChange, error) {
	stats := map[string]FileChange{}
	records := strings.Split(output, "\x00")
	if !strings.Contains(output, "\x00") {
		records = strings.Split(output, "\n")
	}
	for _, record := range records {
		if record == "" {
			continue
		}
		parts := strings.SplitN(record, "\t", 3)
		if len(parts) != 3 {
			continue
		}
		filePath := normalizePath(parts[2])
		status, ok := statuses[filePath]
		if !ok {
			return nil, fmt.Errorf("missing Git status for %q", filePath)
		}
		stats[filePath] = FileChange{
			Status: status, Path: filePath,
			Additions: toNumber(parts[0]), Deletions: toNumber(parts[1]),
		}
	}
	return stats, nil
}

func parseNameStatus(output string) map[string]string {
	statuses := map[string]string{}
	if strings.Contains(output, "\x00") {
		records := strings.Split(output, "\x00")
		for index := 0; index+1 < len(records); index += 2 {
			statuses[normalizePath(records[index+1])] = fileStatus(records[index])
		}
		return statuses
	}
	for _, record := range strings.Split(output, "\n") {
		parts := strings.SplitN(record, "\t", 2)
		if len(parts) != 2 {
			continue
		}
		statuses[normalizePath(parts[1])] = fileStatus(parts[0])
	}
	return statuses
}

func fileStatus(status string) string {
	switch strings.TrimSpace(status) {
	case "A", "D", "R":
		return strings.TrimSpace(status)
	default:
		return "M"
	}
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
		filePath := normalizePath(strings.TrimPrefix(entry, "?? "))
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
