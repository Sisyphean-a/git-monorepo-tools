package snapshot

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"os/exec"
	"strings"
	"unicode/utf8"
)

const maxGitErrorOutputBytes = 64 * 1024

type gitCommandSpec struct {
	executable       string
	repoPath         string
	args             []string
	allowedExitCodes map[int]bool
	stdin            io.Reader
}

func runGit(repoPath string, args []string) (string, error) {
	return defaultGitExecutor().runGit(repoPath, args)
}

func (executor gitExecutor) runGit(repoPath string, args []string) (string, error) {
	return executor.runGitCommand("git", repoPath, args)
}

func (executor gitExecutor) runGitRaw(repoPath string, args []string) (string, error) {
	return executor.runGitCommandRaw("git", repoPath, args)
}

func (executor gitExecutor) runGitPreview(repoPath string, args []string, maxBytes int) (string, bool, error) {
	return executor.runCommandRawWithLimit(gitCommandSpec{
		executable: "git", repoPath: repoPath, args: args,
	}, maxBytes)
}

func (executor gitExecutor) runGitRawWithInput(repoPath string, args []string, input string) (string, error) {
	return executor.runCommandRaw(gitCommandSpec{
		executable: "git", repoPath: repoPath, args: args, stdin: strings.NewReader(input),
	})
}

func (executor gitExecutor) runGitCommand(executable, repoPath string, args []string) (string, error) {
	output, err := executor.runGitCommandRaw(executable, repoPath, args)
	return strings.TrimSpace(output), err
}

func (executor gitExecutor) runGitCommandRaw(executable, repoPath string, args []string) (string, error) {
	return executor.runCommandRaw(gitCommandSpec{executable: executable, repoPath: repoPath, args: args})
}

func (executor gitExecutor) runGitAllowingExitCodeOne(repoPath string, args []string) (string, error) {
	return executor.runCommand(gitCommandSpec{
		executable: "git", repoPath: repoPath, args: args, allowedExitCodes: map[int]bool{1: true},
	})
}

func (executor gitExecutor) runCommand(spec gitCommandSpec) (string, error) {
	output, err := executor.runCommandRaw(spec)
	return strings.TrimSpace(output), err
}

func (executor gitExecutor) runCommandRaw(spec gitCommandSpec) (string, error) {
	output, _, err := executor.runCommandRawWithLimit(spec, 0)
	return output, err
}

func (executor gitExecutor) runCommandRawWithLimit(spec gitCommandSpec, maxBytes int) (string, bool, error) {
	cmd := exec.Command(spec.executable, append([]string{"-C", spec.repoPath}, spec.args...)...)
	applyBackgroundProcessAttrs(cmd)
	cmd.Env = buildGitProcessEnv(executor.proxy)
	cmd.Stdin = spec.stdin
	stdout := newCommandOutputBuffer(maxBytes)
	stderr := newCommandOutputBuffer(maxGitErrorOutputBytes)
	cmd.Stdout = stdout
	cmd.Stderr = stderr
	if err := cmd.Start(); err != nil {
		return "", false, err
	}
	if err, timedOut := waitForCommand(cmd, executor.timeout); timedOut {
		if err != nil {
			return "", false, fmt.Errorf("git %s 超时（%s）：%v", strings.Join(spec.args, " "), executor.timeout, err)
		}
		return "", false, fmt.Errorf("git %s 超时（%s）", strings.Join(spec.args, " "), executor.timeout)
	} else if err != nil && !spec.allowedExitCodes[cmd.ProcessState.ExitCode()] {
		errorOutput := stderr.String()
		if stderr.truncated {
			errorOutput += "\n...[Git 错误输出已截断]"
		}
		return "", stdout.truncated, buildGitError(spec.args, stdout.String(), errorOutput)
	}
	return stdout.String(), stdout.truncated, nil
}

type commandOutputBuffer struct {
	buffer    bytes.Buffer
	maxBytes  int
	truncated bool
}

func newCommandOutputBuffer(maxBytes int) *commandOutputBuffer {
	return &commandOutputBuffer{maxBytes: maxBytes}
}

func (b *commandOutputBuffer) Write(data []byte) (int, error) {
	if b.maxBytes <= 0 {
		return b.buffer.Write(data)
	}
	remaining := b.maxBytes - b.buffer.Len()
	if remaining > 0 {
		keep := min(remaining, len(data))
		_, _ = b.buffer.Write(data[:keep])
	}
	if len(data) > max(remaining, 0) {
		b.truncated = true
	}
	return len(data), nil
}

func (b *commandOutputBuffer) String() string {
	value := b.buffer.String()
	if b.maxBytes <= 0 {
		return value
	}
	return truncateUTF8Prefix(value, b.maxBytes)
}

func truncateUTF8Prefix(value string, maxBytes int) string {
	if maxBytes <= 0 {
		return ""
	}
	end := min(maxBytes, len(value))
	for end > 0 && end < len(value) && !utf8.RuneStart(value[end]) {
		end--
	}
	return validUTF8Prefix(value[:end])
}

func truncateUTF8Suffix(value string, maxBytes int) string {
	if maxBytes <= 0 {
		return ""
	}
	start := max(len(value)-maxBytes, 0)
	for start < len(value) && !utf8.RuneStart(value[start]) {
		start++
	}
	return validUTF8Prefix(value[start:])
}

func validUTF8Prefix(value string) string {
	if utf8.ValidString(value) {
		return value
	}
	for index := 0; index < len(value); {
		_, size := utf8.DecodeRuneInString(value[index:])
		if size == 1 && value[index] >= utf8.RuneSelf {
			return value[:index]
		}
		index += size
	}
	return value
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
