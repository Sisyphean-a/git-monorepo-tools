package snapshot

import (
	"bufio"
	"bytes"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// Rule: 同一时刻只保留当前仓库的一个 check-ignore 会话，目录展开不重复启动 Git 进程。
type repoFileBrowser struct {
	mu             sync.Mutex
	session        *gitIgnoreSession
	sessionStarted time.Time
	watched        map[string]string
}

type gitIgnoreSession struct {
	repoKey string
	cmd     *exec.Cmd
	stdin   io.WriteCloser
	stdout  io.ReadCloser
	writer  *bufio.Writer
	reader  *bufio.Reader
	stderr  bytes.Buffer
}

type gitIgnoreCheckResult struct {
	ignoredPaths map[string]struct{}
	err          error
}

func (browser *repoFileBrowser) ignoredPaths(executor gitExecutor, repoPath, relativePath string, entries []RepoTreeEntry) (map[string]struct{}, error) {
	browser.mu.Lock()
	defer browser.mu.Unlock()
	candidates := gitIgnoreStatePaths(repoPath, relativePath)
	if len(entries) == 0 {
		if browser.session != nil && browser.session.repoKey != normalizedRepoPathKey(repoPath) {
			browser.closeSessionLocked()
		}
		return map[string]struct{}{}, nil
	}

	for attempt := 0; attempt < 2; attempt++ {
		if browser.ignoreStateChangedLocked(candidates) {
			browser.closeSessionLocked()
		}
		if err := browser.ensureSessionLocked(executor, repoPath); err != nil {
			return nil, err
		}
		session := browser.session
		result := make(chan gitIgnoreCheckResult, 1)
		go func() {
			ignoredPaths, err := session.check(entries)
			result <- gitIgnoreCheckResult{ignoredPaths: ignoredPaths, err: err}
		}()

		timer := time.NewTimer(executor.timeout)
		select {
		case checked := <-result:
			timer.Stop()
			if checked.err == nil {
				return checked.ignoredPaths, nil
			}
			detail := browser.closeSessionLocked()
			if attempt == 1 {
				return nil, gitIgnoreSessionError(checked.err, detail)
			}
		case <-timer.C:
			browser.closeSessionLocked()
			<-result
			return nil, fmt.Errorf("git check-ignore 超时（%s）", executor.timeout)
		}
	}
	return nil, fmt.Errorf("git check-ignore 重试状态异常")
}

func (browser *repoFileBrowser) ensureSessionLocked(executor gitExecutor, repoPath string) error {
	repoKey := normalizedRepoPathKey(repoPath)
	if browser.session != nil && browser.session.repoKey == repoKey {
		return nil
	}
	browser.closeSessionLocked()
	session, err := startGitIgnoreSession(executor, repoPath, repoKey)
	if err != nil {
		return err
	}
	browser.session = session
	browser.sessionStarted = time.Now()
	return nil
}

// Flow: 首次观察某路径时，以会话启动时间为基准判断它是否在会话建立后被创建或修改；已观察路径则直接比对状态。
// Rule: 忽略规则文件、仓库配置或索引变化后必须重建会话，避免持久进程返回过期判定。
func (browser *repoFileBrowser) ignoreStateChangedLocked(candidates []string) bool {
	if browser.session == nil {
		return false
	}
	if browser.watched == nil {
		browser.watched = make(map[string]string)
	}
	changed := false
	for _, candidate := range candidates {
		state, modifiedAt := gitIgnoreStateOf(candidate)
		previous, seen := browser.watched[candidate]
		browser.watched[candidate] = state
		if !seen {
			if modifiedAt.After(browser.sessionStarted) {
				changed = true
			}
			continue
		}
		if previous != state {
			changed = true
		}
	}
	return changed
}

func gitIgnoreStatePaths(repoPath, relativePath string) []string {
	candidates := []string{
		filepath.Join(repoPath, ".gitignore"),
		filepath.Join(repoPath, ".git", "config"),
		filepath.Join(repoPath, ".git", "index"),
		filepath.Join(repoPath, ".git", "info", "exclude"),
	}
	directory := ""
	for _, segment := range strings.Split(relativePath, "/") {
		if segment == "" {
			continue
		}
		directory = path.Join(directory, segment)
		candidates = append(candidates, filepath.Join(repoPath, filepath.FromSlash(directory), ".gitignore"))
	}
	return candidates
}

func gitIgnoreStateOf(candidate string) (string, time.Time) {
	info, err := os.Stat(candidate)
	if err != nil {
		return "missing", time.Time{}
	}
	return fmt.Sprintf("%d|%d", info.ModTime().UnixNano(), info.Size()), info.ModTime()
}

func (browser *repoFileBrowser) close() {
	browser.mu.Lock()
	defer browser.mu.Unlock()
	browser.closeSessionLocked()
}

func (browser *repoFileBrowser) closeSessionLocked() string {
	if browser.session == nil {
		return ""
	}
	session := browser.session
	browser.session = nil
	browser.watched = nil
	return session.close()
}

func startGitIgnoreSession(executor gitExecutor, repoPath, repoKey string) (*gitIgnoreSession, error) {
	cmd := exec.Command("git", "-C", repoPath, "check-ignore", "--stdin", "-z", "--verbose", "--non-matching")
	applyBackgroundProcessAttrs(cmd)
	cmd.Env = buildGitProcessEnv(executor.proxy)
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, err
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		_ = stdin.Close()
		return nil, err
	}
	session := &gitIgnoreSession{
		repoKey: repoKey,
		cmd:     cmd,
		stdin:   stdin,
		stdout:  stdout,
		writer:  bufio.NewWriter(stdin),
		reader:  bufio.NewReader(stdout),
	}
	cmd.Stderr = &session.stderr
	if err := cmd.Start(); err != nil {
		_ = stdin.Close()
		_ = stdout.Close()
		return nil, err
	}
	return session, nil
}

func (session *gitIgnoreSession) check(entries []RepoTreeEntry) (map[string]struct{}, error) {
	for _, entry := range entries {
		if _, err := session.writer.WriteString(entry.Path); err != nil {
			return nil, err
		}
		if err := session.writer.WriteByte(0); err != nil {
			return nil, err
		}
	}
	if err := session.writer.Flush(); err != nil {
		return nil, err
	}

	ignoredPaths := make(map[string]struct{})
	for _, entry := range entries {
		if _, err := readGitIgnoreField(session.reader); err != nil {
			return nil, err
		}
		if _, err := readGitIgnoreField(session.reader); err != nil {
			return nil, err
		}
		pattern, err := readGitIgnoreField(session.reader)
		if err != nil {
			return nil, err
		}
		checkedPath, err := readGitIgnoreField(session.reader)
		if err != nil {
			return nil, err
		}
		if path.Clean(checkedPath) != path.Clean(entry.Path) {
			return nil, fmt.Errorf("git check-ignore 返回路径错位：%s", checkedPath)
		}
		if pattern != "" && !strings.HasPrefix(pattern, "!") {
			ignoredPaths[path.Clean(checkedPath)] = struct{}{}
		}
	}
	return ignoredPaths, nil
}

func (session *gitIgnoreSession) close() string {
	_ = session.stdin.Close()
	if session.cmd.ProcessState == nil {
		_, _ = waitForCommand(session.cmd, time.Second)
	}
	_ = session.stdout.Close()
	return strings.TrimSpace(session.stderr.String())
}

func readGitIgnoreField(reader *bufio.Reader) (string, error) {
	field, err := reader.ReadString(0)
	if err != nil {
		return "", err
	}
	return strings.TrimSuffix(field, "\x00"), nil
}

func gitIgnoreSessionError(err error, detail string) error {
	if detail == "" {
		return err
	}
	return fmt.Errorf("%w：%s", err, detail)
}
