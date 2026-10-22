package snapshot

import (
	"crypto/sha1"
	"encoding/hex"
	"os"
	"path/filepath"
	"strings"
)

// worktreeIdentity 标识一个工作树所属的 Git 仓库。
// Rule: 分组只认 common git dir，不按仓库名、远端地址或 `.git` 文件路径猜测。
type worktreeIdentity struct {
	GroupID   string
	GroupName string
	IsMain    bool
}

func resolveWorktreeIdentity(repoPath string) worktreeIdentity {
	repoPath = canonicalFilesystemPath(repoPath)
	gitDir, ok := readWorktreeGitDir(repoPath)
	if !ok {
		// Failure: 无法解析 Git 元数据时保持独立分组，不能把未知仓库合并到一起。
		return worktreeIdentity{
			GroupID:   worktreeGroupID(repoPath),
			GroupName: filepath.Base(repoPath),
			IsMain:    true,
		}
	}

	commonDir := gitDir
	if contents, err := os.ReadFile(filepath.Join(gitDir, "commondir")); err == nil {
		if relative := strings.TrimSpace(string(contents)); relative != "" {
			commonDir = canonicalFilesystemPath(resolveWorktreePath(gitDir, relative))
		}
	}
	commonDir = canonicalFilesystemPath(commonDir)

	return worktreeIdentity{
		GroupID:   worktreeGroupID(commonDir),
		GroupName: worktreeGroupName(commonDir, repoPath),
		IsMain:    sameFilesystemPath(gitDir, commonDir),
	}
}

// readWorktreeGitDir 返回工作树自身的 git dir；主工作树返回 `.git` 目录，链接工作树返回 `.git` 文件指向的目录。
func readWorktreeGitDir(repoPath string) (string, bool) {
	gitPath := filepath.Join(repoPath, ".git")
	info, err := os.Stat(gitPath)
	if err != nil {
		return "", false
	}
	if info.IsDir() {
		return canonicalFilesystemPath(gitPath), true
	}

	contents, err := os.ReadFile(gitPath)
	if err != nil {
		return "", false
	}
	line := strings.TrimSpace(string(contents))
	const prefix = "gitdir:"
	if !strings.HasPrefix(strings.ToLower(line), prefix) {
		return "", false
	}
	target := strings.TrimSpace(line[len(prefix):])
	if target == "" {
		return "", false
	}
	return canonicalFilesystemPath(resolveWorktreePath(repoPath, target)), true
}

func resolveWorktreePath(base, value string) string {
	if !filepath.IsAbs(value) {
		value = filepath.Join(base, value)
	}
	return filepath.Clean(value)
}

func canonicalFilesystemPath(value string) string {
	absolute, err := filepath.Abs(strings.TrimSpace(value))
	if err != nil {
		absolute = strings.TrimSpace(value)
	}
	if resolved, err := filepath.EvalSymlinks(absolute); err == nil {
		absolute = resolved
	}
	return normalizePath(filepath.Clean(absolute))
}

func worktreeGroupID(commonDir string) string {
	sum := sha1.Sum([]byte(normalizedRepoPathKey(commonDir)))
	return "wt-" + hex.EncodeToString(sum[:])[:8]
}

func worktreeGroupName(commonDir, repoPath string) string {
	base := filepath.Base(commonDir)
	if strings.EqualFold(base, ".git") {
		base = filepath.Base(filepath.Dir(commonDir))
	} else if strings.HasSuffix(strings.ToLower(base), ".git") && len(base) > len(".git") {
		base = base[:len(base)-len(".git")]
	}
	if base == "" || base == "." || base == string(filepath.Separator) {
		base = filepath.Base(repoPath)
	}
	return base
}

func sameFilesystemPath(left, right string) bool {
	return normalizedRepoPathKey(left) == normalizedRepoPathKey(right)
}
