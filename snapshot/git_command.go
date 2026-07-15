package snapshot

import (
	"bytes"
	"errors"
	"fmt"
	"os/exec"
	"strings"
)

type gitCommandSpec struct {
	executable       string
	repoPath         string
	args             []string
	allowedExitCodes map[int]bool
}

func runGit(repoPath string, args []string) (string, error) {
	return defaultGitExecutor().runGit(repoPath, args)
}

func (executor gitExecutor) runGit(repoPath string, args []string) (string, error) {
	return executor.runGitCommand("git", repoPath, args)
}

func (executor gitExecutor) runGitCommand(executable, repoPath string, args []string) (string, error) {
	return executor.runCommand(gitCommandSpec{executable: executable, repoPath: repoPath, args: args})
}

func (executor gitExecutor) runGitAllowingExitCodeOne(repoPath string, args []string) (string, error) {
	return executor.runCommand(gitCommandSpec{
		executable: "git", repoPath: repoPath, args: args, allowedExitCodes: map[int]bool{1: true},
	})
}

func (executor gitExecutor) runCommand(spec gitCommandSpec) (string, error) {
	cmd := exec.Command(spec.executable, append([]string{"-C", spec.repoPath}, spec.args...)...)
	applyBackgroundProcessAttrs(cmd)
	cmd.Env = buildGitProcessEnv(executor.proxy)
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Start(); err != nil {
		return "", err
	}
	if err, timedOut := waitForCommand(cmd, executor.timeout); timedOut {
		return "", fmt.Errorf("git %s 超时（%s）", strings.Join(spec.args, " "), executor.timeout)
	} else if err != nil && !spec.allowedExitCodes[cmd.ProcessState.ExitCode()] {
		return "", buildGitError(spec.args, stdout.String(), stderr.String())
	}
	return strings.TrimSpace(stdout.String()), nil
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
