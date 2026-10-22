package snapshot

import (
	"crypto/sha256"
	"errors"
	"fmt"
	"strings"
)

const (
	defaultHistoryPageSize = 50
	emptyTreeHash          = "4b825dc642cb6eb9a060e54bf8d69288fbee4904"

	HistoryScopeAll      = "all"
	HistoryScopeHead     = "head"
	HistoryScopeSelected = "selected"
)

// Rule: 全引用历史的提交与标签由引用集合及 HEAD 归属决定，不能仅用当前 HEAD 或提交数量判定变化。
// Rule: stash 与 notes 不是分支历史，既不读取其提交，也不让其变化触发历史重载。
func (executor gitExecutor) readHistoryRefsRevision(repoPath string) (string, error) {
	output, err := executor.runGit(repoPath, []string{"for-each-ref", "--sort=refname", "--format=%(refname)%00%(objectname)%00%(symref)%00%(HEAD)"})
	if err != nil {
		return "", err
	}
	lines := []string{}
	for _, line := range strings.Split(output, "\n") {
		if line == "" {
			continue
		}
		refName, _, _ := strings.Cut(line, "\x00")
		if isExcludedHistoryRef(refName) {
			continue
		}
		lines = append(lines, line)
	}
	return fmt.Sprintf("%x", sha256.Sum256([]byte(strings.Join(lines, "\n")))), nil
}

// Flow: Git 决定所选引用范围内的拓扑顺序，父提交哈希使前端分页追加时保持同一张提交图。
func (executor gitExecutor) loadHistoryPage(repoPath, scope string, refs []string, offset, limit int) ([]CommitSummary, bool, error) {
	if offset < 0 {
		offset = 0
	}
	if limit <= 0 {
		limit = defaultHistoryPageSize
	}
	args := []string{"log"}
	args = append(args, historyRevisionArgs(scope, refs)...)
	args = append(args, "--topo-order", fmt.Sprintf("--skip=%d", offset), fmt.Sprintf("-%d", limit+1),
		"--numstat", "--decorate=short", "--format=%H%x1f%h%x1f%an%x1f%ar%x1f%s%x1f%P%x1f%D")
	output, err := executor.runGit(repoPath, args)
	if err != nil {
		return nil, false, err
	}
	if strings.TrimSpace(output) == "" {
		return []CommitSummary{}, false, nil
	}
	history := parseHistoryOutput(output)
	hasMore := len(history) > limit
	if hasMore {
		history = history[:limit]
	}
	return history, hasMore, nil
}

func normalizeHistoryScope(scope string) string {
	switch strings.TrimSpace(scope) {
	case HistoryScopeHead:
		return HistoryScopeHead
	case HistoryScopeSelected:
		return HistoryScopeSelected
	default:
		return HistoryScopeAll
	}
}

func historyRevisionArgs(scope string, refs []string) []string {
	switch normalizeHistoryScope(scope) {
	case HistoryScopeHead:
		return []string{"HEAD"}
	case HistoryScopeSelected:
		if len(refs) == 0 {
			return []string{"HEAD"}
		}
		return refs
	default:
		// Rule: stash/notes 不是分支历史，不能进入提交图。
		return []string{"--exclude=refs/stash", "--exclude=refs/notes/*", "--all"}
	}
}

// loadHistoryRefs 返回分支选择器可用引用；只接受本地分支、远端分支和标签。
func (executor gitExecutor) loadHistoryRefs(repoPath string) ([]RepoRef, error) {
	output, err := executor.runGit(repoPath, []string{
		"for-each-ref", "--sort=refname",
		"--format=%(refname)%00%(objectname)%00%(HEAD)%00%(symref)%00%(objecttype)",
		"refs/heads", "refs/remotes", "refs/tags",
	})
	if err != nil {
		return nil, err
	}

	refs := make([]RepoRef, 0)
	for _, line := range strings.Split(output, "\n") {
		if line == "" {
			continue
		}
		fields := strings.Split(line, "\x00")
		if len(fields) < 5 {
			continue
		}
		name := strings.TrimSpace(fields[0])
		// Rule: 跳过 origin/HEAD 等符号引用；它们与目标分支重复。
		if fields[3] != "" {
			continue
		}
		if fields[4] != "commit" && fields[4] != "tag" {
			continue
		}
		kind, shortName := classifyHistoryRef(name)
		if kind == "" {
			continue
		}
		refs = append(refs, RepoRef{
			Name:      name,
			ShortName: shortName,
			Kind:      kind,
			Hash:      fields[1],
			Current:   strings.TrimSpace(fields[2]) == "*",
		})
	}
	return refs, nil
}

func classifyHistoryRef(name string) (string, string) {
	switch {
	case strings.HasPrefix(name, "refs/heads/"):
		return "branch", strings.TrimPrefix(name, "refs/heads/")
	case strings.HasPrefix(name, "refs/remotes/"):
		return "remote", strings.TrimPrefix(name, "refs/remotes/")
	case strings.HasPrefix(name, "refs/tags/"):
		return "tag", strings.TrimPrefix(name, "refs/tags/")
	default:
		return "", ""
	}
}

func filterHistoryRefs(refs []RepoRef, requested []string) []string {
	allowed := make(map[string]struct{}, len(refs))
	for _, ref := range refs {
		allowed[ref.Name] = struct{}{}
	}
	selected := make([]string, 0, len(requested))
	seen := make(map[string]struct{}, len(requested))
	for _, name := range requested {
		name = strings.TrimSpace(name)
		if _, ok := allowed[name]; !ok {
			continue
		}
		if _, ok := seen[name]; ok {
			continue
		}
		seen[name] = struct{}{}
		selected = append(selected, name)
	}
	return selected
}

func parseHistoryOutput(output string) []CommitSummary {
	history := []CommitSummary{}
	var current *CommitSummary
	for _, line := range filterNonEmpty(strings.Split(output, "\n")) {
		if strings.Contains(line, "\x1f") {
			if current != nil {
				history = append(history, *current)
			}
			commit, ok := parseHistoryCommit(line)
			if !ok {
				current = nil
				continue
			}
			current = &commit
			continue
		}
		appendCommitStats(current, line)
	}
	if current != nil {
		history = append(history, *current)
	}
	return history
}

func appendCommitStats(commit *CommitSummary, line string) {
	if commit == nil {
		return
	}
	additions, deletions, ok := parseNumstatLine(line)
	if !ok {
		return
	}
	commit.Additions += additions
	commit.Deletions += deletions
	commit.Files++
}

func parseHistoryRefs(raw string) []string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return nil
	}
	refs := []string{}
	for _, part := range strings.Split(trimmed, ",") {
		label := strings.TrimSpace(part)
		if strings.HasPrefix(label, "HEAD -> ") {
			label = strings.TrimSpace(strings.TrimPrefix(label, "HEAD -> "))
		}
		if label != "" {
			if isExcludedHistoryRef(label) {
				continue
			}
			refs = append(refs, label)
		}
	}
	return refs
}

func isExcludedHistoryRef(refName string) bool {
	return refName == "refs/stash" || strings.HasPrefix(refName, "refs/notes/")
}

func (executor gitExecutor) loadCommitDetail(repoPath, hash string) (CommitDetail, error) {
	metaOutput, err := executor.runGit(repoPath, []string{
		"show", "--quiet", "--decorate=short",
		"--format=%H%x00%h%x00%an%x00%ae%x00%ar%x00%aI%x00%s%x00%b%x00%P%x00%D", hash,
	})
	if err != nil {
		return CommitDetail{}, err
	}
	detail, err := parseCommitDetail(metaOutput)
	if err != nil {
		return CommitDetail{}, err
	}
	changes, err := executor.loadCommitChanges(repoPath, detail)
	if err != nil {
		return CommitDetail{}, err
	}
	detail.ChangedFiles = changes
	detail.FilesChanged = make([]string, 0, len(changes))
	for _, change := range changes {
		detail.FilesChanged = append(detail.FilesChanged, change.Path)
		detail.Additions += change.Additions
		detail.Deletions += change.Deletions
		detail.Files++
	}
	return detail, nil
}

func (executor gitExecutor) commitDiffBase(repoPath, hash string) (string, error) {
	output, err := executor.runGit(repoPath, []string{"rev-list", "--parents", "-n", "1", hash})
	if err != nil {
		return "", err
	}
	parts := strings.Fields(output)
	if len(parts) == 0 {
		return "", fmt.Errorf("未找到提交：%s", hash)
	}
	if len(parts) == 1 {
		return emptyTreeHash, nil
	}
	return parts[1], nil
}

type commitFileStatus struct {
	status       string
	path         string
	previousPath string
}

func (executor gitExecutor) loadCommitChanges(repoPath string, detail CommitDetail) ([]FileChange, error) {
	base := emptyTreeHash
	if len(detail.ParentHashes) > 0 {
		base = detail.ParentHashes[0]
	}
	statusOutput, err := executor.runGitRaw(repoPath, commitDiffArgs("--name-status", base, detail.Hash))
	if err != nil {
		return nil, err
	}
	statsOutput, err := executor.runGitRaw(repoPath, commitDiffArgs("--numstat", base, detail.Hash))
	if err != nil {
		return nil, err
	}
	statuses := parseCommitNameStatus(statusOutput)
	stats := parseCommitNumstat(statsOutput)
	if len(statuses) != len(stats) {
		return nil, fmt.Errorf("提交差异文件列表格式异常：文件 %d，统计 %d", len(statuses), len(stats))
	}
	changes := make([]FileChange, 0, len(statuses))
	for index, status := range statuses {
		stat := stats[index]
		changes = append(changes, FileChange{
			ID:           status.path + "::commit",
			Status:       status.status,
			Path:         status.path,
			PreviousPath: status.previousPath,
			Additions:    stat.additions,
			Deletions:    stat.deletions,
		})
	}
	return changes, nil
}

func commitDiffArgs(format, base, hash string) []string {
	return []string{"diff", "--no-ext-diff", "--find-renames", format, "-z", base, hash, "--"}
}

func parseCommitNameStatus(output string) []commitFileStatus {
	tokens := strings.Split(output, "\x00")
	statuses := make([]commitFileStatus, 0)
	for index := 0; index < len(tokens); {
		rawStatus := tokens[index]
		index++
		if rawStatus == "" || index >= len(tokens) {
			continue
		}
		path := normalizePath(tokens[index])
		index++
		if path == "" {
			continue
		}
		status := normalizeCommitFileStatus(rawStatus)
		previousPath := ""
		if rawStatus[0] == 'R' || rawStatus[0] == 'C' {
			previousPath = path
			if index >= len(tokens) {
				break
			}
			path = normalizePath(tokens[index])
			index++
		}
		if path != "" {
			statuses = append(statuses, commitFileStatus{status: status, path: path, previousPath: previousPath})
		}
	}
	return statuses
}

func normalizeCommitFileStatus(raw string) string {
	if raw == "" {
		return "M"
	}
	switch raw[0] {
	case 'A', 'D', 'M', 'R':
		return string(raw[0])
	case 'C':
		return "A"
	default:
		return "M"
	}
}

type commitFileStat struct {
	additions int
	deletions int
}

func parseCommitNumstat(output string) []commitFileStat {
	tokens := strings.Split(output, "\x00")
	stats := make([]commitFileStat, 0)
	for index := 0; index < len(tokens); {
		record := tokens[index]
		index++
		if record == "" {
			continue
		}
		parts := strings.SplitN(record, "\t", 3)
		if len(parts) != 3 {
			continue
		}
		if parts[2] == "" {
			if index+1 >= len(tokens) {
				break
			}
			index += 2
		}
		stats = append(stats, commitFileStat{additions: toNumber(parts[0]), deletions: toNumber(parts[1])})
	}
	return stats
}

func parseCommitDetail(output string) (CommitDetail, error) {
	if output == "" {
		return CommitDetail{}, errors.New("未找到提交详情")
	}
	parts := strings.Split(output, "\x00")
	if len(parts) < 10 {
		return CommitDetail{}, errors.New("提交详情格式异常")
	}
	return CommitDetail{
		CommitSummary: CommitSummary{
			Hash: parts[0], ShortHash: parts[1], Author: parts[2], Time: parts[4], Message: parts[6],
			Parents: len(strings.Fields(strings.TrimSpace(parts[8]))), ParentHashes: parseParentHashes(parts[8]), Refs: parseHistoryRefs(parts[9]),
		},
		Body: strings.TrimSpace(parts[7]), AuthorEmail: parts[3], CommittedAt: parts[5],
	}, nil
}

func parseHistoryCommit(line string) (CommitSummary, bool) {
	parts := strings.Split(line, "\x1f")
	if len(parts) < 7 {
		return CommitSummary{}, false
	}
	return CommitSummary{
		Hash: parts[0], ShortHash: parts[1], Author: parts[2], Time: parts[3], Message: parts[4],
		Parents: len(strings.Fields(strings.TrimSpace(parts[5]))), ParentHashes: parseParentHashes(parts[5]), Refs: parseHistoryRefs(parts[6]),
	}, true
}

func parseParentHashes(raw string) []string {
	parents := strings.Fields(strings.TrimSpace(raw))
	if len(parents) == 0 {
		return []string{}
	}
	return parents
}

func parseNumstatLine(line string) (int, int, bool) {
	parts := strings.Split(line, "\t")
	if len(parts) != 3 {
		return 0, 0, false
	}
	return toNumber(parts[0]), toNumber(parts[1]), true
}

func isNoCommitHistoryError(err error) bool {
	if err == nil {
		return false
	}
	message := err.Error()
	if strings.Contains(message, "does not have any commits yet") || strings.Contains(message, "bad revision 'HEAD'") {
		return true
	}
	return strings.Contains(message, "ambiguous argument 'HEAD'") && strings.Contains(message, "unknown revision")
}
