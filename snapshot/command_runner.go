package snapshot

import (
	"errors"
	"io"
	"os/exec"
	"runtime"
	"strings"
	"sync"
	"time"
)

type ansiStripperState uint8

const (
	ansiText ansiStripperState = iota
	ansiEscape
	ansiCSI
	ansiOSC
	ansiOSCEscape
	ansiControlString
	ansiControlStringEscape
	ansiEscapeIntermediate
)

type ansiStripper struct {
	state ansiStripperState
}

func (s *ansiStripper) Write(chunk string) string {
	if chunk == "" {
		return ""
	}

	var output strings.Builder
	output.Grow(len(chunk))
	for index := 0; index < len(chunk); index++ {
		current := chunk[index]
		switch s.state {
		case ansiText:
			if current == 0x1b {
				s.state = ansiEscape
				continue
			}
			output.WriteByte(current)
		case ansiEscape:
			switch {
			case current == '[':
				s.state = ansiCSI
			case current == ']':
				s.state = ansiOSC
			case current == 'P' || current == 'X' || current == '^' || current == '_':
				s.state = ansiControlString
			case current >= 0x20 && current <= 0x2f:
				s.state = ansiEscapeIntermediate
			default:
				s.state = ansiText
			}
		case ansiCSI:
			if current >= 0x40 && current <= 0x7e {
				s.state = ansiText
			}
		case ansiOSC:
			if current == 0x07 {
				s.state = ansiText
				continue
			}
			if current == 0x1b {
				s.state = ansiOSCEscape
			}
		case ansiOSCEscape:
			if current == '\\' {
				s.state = ansiText
				continue
			}
			if current != 0x1b {
				s.state = ansiOSC
			}
		case ansiControlString:
			if current == 0x1b {
				s.state = ansiControlStringEscape
				continue
			}
			if current == 0x07 {
				s.state = ansiText
			}
		case ansiControlStringEscape:
			if current == '\\' || current == 0x07 {
				s.state = ansiText
				continue
			}
			s.state = ansiControlString
		case ansiEscapeIntermediate:
			if current >= 0x30 && current <= 0x7e {
				s.state = ansiText
			}
		}
	}
	return output.String()
}

func (s *Service) RunRepoCommand(request RepoCommandRequest) (RepoCommandResult, error) {
	return s.runRepoCommand(request, nil, true)
}

func (s *Service) StreamRepoCommand(request RepoCommandRequest, onChunk func(string)) (RepoCommandResult, error) {
	return s.runRepoCommand(request, onChunk, false)
}

func (s *Service) runRepoCommand(request RepoCommandRequest, onChunk func(string), captureOutput bool) (RepoCommandResult, error) {
	repoPath := normalizePath(strings.TrimSpace(request.RepoPath))
	commandText := strings.TrimSpace(request.Command)
	if repoPath == "" {
		return RepoCommandResult{}, errors.New("缺少仓库路径")
	}
	if commandText == "" {
		return RepoCommandResult{}, errors.New("缺少命令")
	}
	if !pathExists(repoPath) {
		return RepoCommandResult{}, errors.New("目标目录不存在")
	}

	startedAt := time.Now()
	output, exitCode, err := runShellCommand(repoPath, commandText, onChunk, captureOutput)
	result := RepoCommandResult{
		RepoPath:  repoPath,
		Command:   commandText,
		Output:    strings.TrimRight(output, "\r\n"),
		ExitCode:  exitCode,
		StartedAt: startedAt.UnixMilli(),
		EndedAt:   time.Now().UnixMilli(),
	}
	if err != nil {
		return result, err
	}
	return result, nil
}

func runShellCommand(repoPath, commandText string, onChunk func(string), captureOutput bool) (string, int, error) {
	cmd := buildShellCommand(repoPath, commandText)
	applyBackgroundProcessAttrs(cmd)
	cmd.Env = buildGitProcessEnv()
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return "", -1, err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return "", -1, err
	}
	if err := cmd.Start(); err != nil {
		return "", -1, err
	}

	var builder *strings.Builder
	if captureOutput {
		builder = &strings.Builder{}
	}
	var lock sync.Mutex
	var streamGroup sync.WaitGroup
	streamGroup.Add(2)
	go streamCommand(stdout, onChunk, builder, &lock, &streamGroup)
	go streamCommand(stderr, onChunk, builder, &lock, &streamGroup)
	waitErr := cmd.Wait()
	streamGroup.Wait()

	output := ""
	if builder != nil {
		output = builder.String()
	}
	if waitErr == nil {
		return output, 0, nil
	}
	var exitErr *exec.ExitError
	if errors.As(waitErr, &exitErr) {
		return output, exitErr.ExitCode(), nil
	}
	return output, -1, waitErr
}

func streamCommand(reader io.Reader, onChunk func(string), builder *strings.Builder, lock *sync.Mutex, streamGroup *sync.WaitGroup) {
	defer streamGroup.Done()
	buffer := make([]byte, 4096)
	stripper := ansiStripper{}
	for {
		readBytes, err := reader.Read(buffer)
		if readBytes > 0 {
			chunk := stripper.Write(string(buffer[:readBytes]))
			if chunk != "" {
				lock.Lock()
				if builder != nil {
					builder.WriteString(chunk)
				}
				if onChunk != nil {
					onChunk(chunk)
				}
				lock.Unlock()
			}
		}
		if errors.Is(err, io.EOF) {
			return
		}
		if err != nil {
			lock.Lock()
			if builder != nil {
				builder.WriteString(err.Error())
			}
			if onChunk != nil {
				onChunk(err.Error())
			}
			lock.Unlock()
			return
		}
	}
}

func buildShellCommand(repoPath, commandText string) *exec.Cmd {
	if runtime.GOOS == "windows" {
		cmd := exec.Command("powershell.exe", "-NoLogo", "-NoProfile", "-NonInteractive", "-Command", commandText)
		cmd.Dir = repoPath
		return cmd
	}
	cmd := exec.Command("sh", "-lc", commandText)
	cmd.Dir = repoPath
	return cmd
}
