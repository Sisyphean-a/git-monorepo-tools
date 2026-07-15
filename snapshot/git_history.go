package snapshot

import (
	"errors"
	"fmt"
	"strings"
)

const defaultHistoryPageSize = 50

func (executor gitExecutor) loadHistoryPage(repoPath string, offset, limit int) ([]CommitSummary, bool, error) {
	if offset < 0 {
		offset = 0
	}
	if limit <= 0 {
		limit = defaultHistoryPageSize
	}
	output, err := executor.runGit(repoPath, []string{
		"log", fmt.Sprintf("--skip=%d", offset), fmt.Sprintf("-%d", limit+1),
		"--numstat", "--decorate=short", "--format=%H%x1f%h%x1f%an%x1f%ar%x1f%s%x1f%P%x1f%D",
	})
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
			refs = append(refs, label)
		}
	}
	return refs
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
	statsOutput, err := executor.runGit(repoPath, []string{"show", "--numstat", "--format=", hash})
	if err != nil {
		return CommitDetail{}, err
	}
	applyCommitDetailStats(&detail, statsOutput)
	return detail, nil
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
			Parents: len(strings.Fields(strings.TrimSpace(parts[8]))), Refs: parseHistoryRefs(parts[9]),
		},
		Body: strings.TrimSpace(parts[7]), AuthorEmail: parts[3], CommittedAt: parts[5],
	}, nil
}

func applyCommitDetailStats(detail *CommitDetail, output string) {
	for _, line := range filterNonEmpty(strings.Split(output, "\n")) {
		additions, deletions, ok := parseNumstatLine(line)
		if !ok {
			continue
		}
		parts := strings.Split(line, "\t")
		detail.Additions += additions
		detail.Deletions += deletions
		detail.Files++
		detail.FilesChanged = append(detail.FilesChanged, normalizePath(parts[2]))
	}
}

func parseHistoryCommit(line string) (CommitSummary, bool) {
	parts := strings.Split(line, "\x1f")
	if len(parts) < 7 {
		return CommitSummary{}, false
	}
	return CommitSummary{
		Hash: parts[0], ShortHash: parts[1], Author: parts[2], Time: parts[3], Message: parts[4],
		Parents: len(strings.Fields(strings.TrimSpace(parts[5]))), Refs: parseHistoryRefs(parts[6]),
	}, true
}

func parseNumstatLine(line string) (int, int, bool) {
	parts := strings.Split(line, "\t")
	if len(parts) != 3 {
		return 0, 0, false
	}
	return toNumber(parts[0]), toNumber(parts[1]), true
}

func isNoCommitHistoryError(err error) bool {
	return err != nil && strings.Contains(err.Error(), "does not have any commits yet")
}
