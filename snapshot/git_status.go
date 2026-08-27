package snapshot

import (
	"bytes"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strconv"
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
	branch       string
	headRevision string
	remote       string
	ahead        int
	behind       int
	conflicts    int
	entries      []string
}

func (executor gitExecutor) readStatus(repoPath string) (parsedStatus, error) {
	output, err := executor.runGitRaw(repoPath, []string{"status", "--porcelain=v2", "--branch", "-z", "--untracked-files=all"})
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
	containsNUL := strings.Contains(output, "\x00")
	records := strings.Split(output, "\x00")
	if !containsNUL {
		records = strings.Split(output, "\n")
	}
	parsed := parsedStatus{branch: "HEAD", remote: "—", entries: []string{}}
	branchLine := "## HEAD"
	for _, record := range records {
		if !containsNUL {
			record = strings.TrimSuffix(record, "\r")
		}
		if record == "" {
			continue
		}
		switch {
		case strings.HasPrefix(record, "# branch.oid "):
			parsed.headRevision = strings.TrimPrefix(record, "# branch.oid ")
		case strings.HasPrefix(record, "# branch.head "):
			parsed.branch = strings.TrimPrefix(record, "# branch.head ")
		case strings.HasPrefix(record, "# branch.upstream "):
			upstream := strings.TrimPrefix(record, "# branch.upstream ")
			parsed.remote = strings.Split(upstream, "/")[0]
		case strings.HasPrefix(record, "# branch.ab "):
			fmt.Sscanf(strings.TrimPrefix(record, "# branch.ab "), "+%d -%d", &parsed.ahead, &parsed.behind)
		case strings.HasPrefix(record, "## "):
			branchLine = record
		case strings.HasPrefix(record, "? "):
			parsed.entries = append(parsed.entries, "?? "+strings.TrimPrefix(record, "? "))
		default:
			parsed.entries = append(parsed.entries, record)
		}
	}
	if branchLine != "## HEAD" || !strings.Contains(output, "# branch.") {
		parsed.branch = extractBranch(branchLine)
		parsed.remote = extractRemote(branchLine)
		parsed.ahead = extractCount(branchLine, "ahead")
		parsed.behind = extractCount(branchLine, "behind")
	}
	parsed.conflicts = countConflicts(parsed.entries)
	return parsed
}

type fileChangeGroup struct {
	stats       map[string]FileChange
	baseObjects map[string]string
	statsErr    error
	statusErr   error
	parseErr    error
	baseErr     error
}

func (executor gitExecutor) loadFileChangeGroup(repoPath string, staged bool) fileChangeGroup {
	stagedArgs := func(format string) []string {
		args := []string{"diff"}
		if staged {
			args = append(args, "--cached")
		}
		args = append(args, format, "-z", "--no-renames")
		if format == "--raw" {
			args = append(args, "--no-abbrev")
		}
		return args
	}

	statsOutput, statsErr := executor.runGitRaw(repoPath, stagedArgs("--numstat"))
	statusOutput, statusErr := executor.runGitRaw(repoPath, stagedArgs("--name-status"))
	stats, parseErr := parseNumstat(statsOutput, parseNameStatus(statusOutput))
	// The raw diff keeps the old blob ID even when the worktree path has already been deleted.
	baseOutput, baseErr := executor.runGitRaw(repoPath, stagedArgs("--raw"))

	return fileChangeGroup{
		stats: stats, baseObjects: parseDiffBaseObjects(baseOutput),
		statsErr: statsErr, statusErr: statusErr, parseErr: parseErr, baseErr: baseErr,
	}
}

func (executor gitExecutor) buildFileChanges(repoPath string, entries []string) ([]FileChange, error) {
	// Parse each stage before reading the next one so Git's raw output does not remain live together.
	staged := executor.loadFileChangeGroup(repoPath, true)
	unstaged := executor.loadFileChangeGroup(repoPath, false)
	objectSizes, objectSizeErr := executor.readObjectSizes(repoPath, collectObjectIDs(staged.baseObjects, unstaged.baseObjects))
	stagedPreviousSizes, stagedPreviousSizeBytes := resolvePreviousSizes(staged.baseObjects, objectSizes)
	unstagedPreviousSizes, unstagedPreviousSizeBytes := resolvePreviousSizes(unstaged.baseObjects, objectSizes)

	changes := buildTrackedChanges(repoPath, staged.stats, stagedPreviousSizes, stagedPreviousSizeBytes, true)
	changes = append(changes, buildTrackedChanges(repoPath, unstaged.stats, unstagedPreviousSizes, unstagedPreviousSizeBytes, false)...)
	changes = append(changes, buildUntrackedChanges(repoPath, entries, changes)...)
	slices.SortFunc(changes, compareFileChanges)
	return changes, firstGitError(
		staged.statsErr, staged.statusErr, unstaged.statsErr, unstaged.statusErr,
		staged.parseErr, unstaged.parseErr, staged.baseErr, unstaged.baseErr, objectSizeErr,
	)
}

func parseDiffBaseObjects(output string) map[string]string {
	objects := map[string]string{}
	records := strings.Split(output, "\x00")
	for index := 0; index+1 < len(records); {
		metadata := records[index]
		if metadata == "" {
			index++
			continue
		}
		parts := strings.Fields(metadata)
		if len(parts) < 5 || !strings.HasPrefix(parts[0], ":") {
			index++
			continue
		}
		filePath := normalizePath(records[index+1])
		if filePath != "" && !isZeroObjectID(parts[2]) {
			objects[filePath] = parts[2]
		}
		index += 2
	}
	return objects
}

func collectObjectIDs(groups ...map[string]string) map[string]string {
	merged := map[string]string{}
	for _, group := range groups {
		for _, objectID := range group {
			if !isZeroObjectID(objectID) {
				merged[objectID] = objectID
			}
		}
	}
	return merged
}

func isZeroObjectID(value string) bool {
	return value == "" || strings.Trim(value, "0") == ""
}

func (executor gitExecutor) readObjectSizes(repoPath string, objectIDs map[string]string) (map[string]int64, error) {
	uniqueIDs := map[string]bool{}
	for _, objectID := range objectIDs {
		if !isZeroObjectID(objectID) {
			uniqueIDs[objectID] = true
		}
	}
	if len(uniqueIDs) == 0 {
		return map[string]int64{}, nil
	}

	ids := make([]string, 0, len(uniqueIDs))
	for objectID := range uniqueIDs {
		ids = append(ids, objectID)
	}
	slices.Sort(ids)
	output, err := executor.runGitRawWithInput(
		repoPath,
		[]string{"cat-file", "--batch-check=%(objectname) %(objecttype) %(objectsize)"},
		strings.Join(ids, "\n")+"\n",
	)
	if err != nil {
		return nil, err
	}

	sizes := make(map[string]int64, len(ids))
	for _, line := range strings.Split(strings.TrimSpace(output), "\n") {
		parts := strings.Fields(line)
		if len(parts) == 2 && parts[1] == "missing" {
			return nil, fmt.Errorf("missing Git object %q", parts[0])
		}
		if len(parts) != 3 {
			return nil, fmt.Errorf("invalid Git object size response: %q", line)
		}
		size, parseErr := strconv.ParseInt(parts[2], 10, 64)
		if parseErr != nil {
			return nil, fmt.Errorf("invalid Git object size %q: %w", parts[2], parseErr)
		}
		sizes[parts[0]] = size
	}
	if len(sizes) != len(ids) {
		return nil, fmt.Errorf("Git object size response count mismatch: got %d, want %d", len(sizes), len(ids))
	}
	return sizes, nil
}

func resolvePreviousSizes(objectIDs map[string]string, objectSizes map[string]int64) (map[string]string, map[string]int64) {
	previousSizes := map[string]string{}
	previousSizeBytes := map[string]int64{}
	for filePath, objectID := range objectIDs {
		if size, ok := objectSizes[objectID]; ok {
			previousSizes[filePath] = formatSize(size)
			previousSizeBytes[filePath] = size
		}
	}
	return previousSizes, previousSizeBytes
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

func buildTrackedChanges(repoPath string, stats map[string]FileChange, previousSizes map[string]string, previousSizeBytes map[string]int64, staged bool) []FileChange {
	changes := make([]FileChange, 0, len(stats))
	for _, stat := range stats {
		stat.ID = stat.Path + "::" + stagedLabel(staged)
		sizeBytes := resolveSize(filepath.Join(repoPath, stat.Path))
		stat.Size = formatSize(sizeBytes)
		stat.SizeBytes = sizeBytes
		stat.PreviousSize = previousSizes[stat.Path]
		stat.PreviousSizeBytes = previousSizeBytes[stat.Path]
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
		sizeBytes := resolveSize(absolute)
		changes = append(changes, FileChange{
			ID: id, Status: "A", Path: filePath, Additions: countFileLines(absolute),
			Deletions: 0, Size: formatSize(sizeBytes), SizeBytes: sizeBytes, Staged: false, Untracked: true,
		})
	}
	return changes
}

func extractBranch(line string) string {
	// porcelain -b 格式：## <branch>...<upstream> [ahead N, behind M]；分支名可含点号，用 "..." 分隔
	body := strings.TrimPrefix(line, "## ")
	if index := strings.Index(body, "..."); index >= 0 {
		body = body[:index]
	}
	if body == "" || body == "HEAD" {
		return "HEAD"
	}
	if index := strings.IndexAny(body, " \t"); index >= 0 {
		// 无 upstream 时的尾注，如 "HEAD (no branch)"
		body = body[:index]
	}
	if body == "" {
		return "HEAD"
	}
	return body
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
		if strings.HasPrefix(entry, "u ") {
			fields := strings.Fields(entry)
			if len(fields) > 1 {
				code = fields[1]
			}
		} else if len(entry) >= 2 {
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
	file, err := os.Open(filePath)
	if err != nil {
		return 0
	}
	defer file.Close()

	buffer := make([]byte, 32*1024)
	lineBreaks := 0
	hasContent := false
	for {
		readBytes, readErr := file.Read(buffer)
		if readBytes > 0 {
			hasContent = true
			lineBreaks += bytes.Count(buffer[:readBytes], []byte{'\n'})
		}
		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			return 0
		}
	}
	if !hasContent {
		return 0
	}
	return lineBreaks + 1
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
