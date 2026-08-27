package snapshot

import (
	"errors"
	"fmt"
	"io"
	"os/exec"
	"runtime"
	"strings"
	"sync"
	"time"
)

const maxCapturedCommandOutputBytes = 256 * 1024

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
	executor := newGitExecutor(Request{Proxy: request.Proxy, TimeoutSeconds: request.TimeoutSeconds})
	output, exitCode, err := executor.runShellCommand(shellCommand{
		repoPath:      repoPath,
		commandText:   commandText,
		onChunk:       onChunk,
		captureOutput: captureOutput,
	})
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

type shellCommand struct {
	repoPath      string
	commandText   string
	onChunk       func(string)
	captureOutput bool
}

func (executor gitExecutor) runShellCommand(command shellCommand) (string, int, error) {
	cmd := buildShellCommand(command.repoPath, command.commandText)
	applyBackgroundProcessAttrs(cmd)
	cmd.Env = buildGitProcessEnv(executor.proxy)
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

	var builder *cappedStringBuilder
	if command.captureOutput {
		builder = &cappedStringBuilder{maxBytes: maxCapturedCommandOutputBytes}
	}
	var lock sync.Mutex
	var streamGroup sync.WaitGroup
	streamGroup.Add(2)
	go streamCommand(stdout, command.onChunk, builder, &lock, &streamGroup)
	go streamCommand(stderr, command.onChunk, builder, &lock, &streamGroup)
	waitErr, timedOut := waitForCommand(cmd, executor.timeout)
	drainStreams(&streamGroup)

	output := ""
	if builder != nil {
		output = builder.stringWithTruncationMarker()
	}
	if timedOut {
		if waitErr != nil {
			return output, -1, fmt.Errorf("命令执行超时（%s）：%v", executor.timeout, waitErr)
		}
		return output, -1, fmt.Errorf("命令执行超时（%s）", executor.timeout)
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

type cappedStringBuilder struct {
	chunks      []string
	first       int
	firstOffset int
	length      int
	maxBytes    int
	truncated   bool
}

func (b *cappedStringBuilder) WriteString(value string) {
	if value == "" {
		return
	}
	if len(value) >= b.maxBytes {
		value = truncateUTF8Suffix(value, b.maxBytes)
		b.chunks = []string{value}
		b.first = 0
		b.firstOffset = 0
		b.length = len(value)
		b.truncated = true
		return
	}

	b.chunks = append(b.chunks, value)
	b.length += len(value)
	if b.length > b.maxBytes {
		excess := b.length - b.maxBytes
		for excess > 0 && b.first < len(b.chunks) {
			chunk := b.chunks[b.first]
			available := len(chunk) - b.firstOffset
			if excess >= available {
				excess -= available
				b.length -= available
				b.first++
				b.firstOffset = 0
				continue
			}
			b.firstOffset += excess
			b.length -= excess
			excess = 0
		}
		b.truncated = true
	}
	if b.first > 64 && b.first*2 >= len(b.chunks) {
		b.chunks = append([]string(nil), b.chunks[b.first:]...)
		b.first = 0
	}
}

func (b *cappedStringBuilder) String() string {
	if b.first >= len(b.chunks) {
		return ""
	}
	var output strings.Builder
	output.Grow(b.length)
	output.WriteString(b.chunks[b.first][b.firstOffset:])
	for _, chunk := range b.chunks[b.first+1:] {
		output.WriteString(chunk)
	}
	return truncateUTF8Suffix(output.String(), b.maxBytes)
}

func (b *cappedStringBuilder) stringWithTruncationMarker() string {
	value := b.String()
	if !b.truncated {
		return value
	}
	const marker = "...[命令输出已截断]"
	if value == "" {
		return truncateUTF8Suffix(marker, b.maxBytes)
	}
	available := b.maxBytes - len(marker) - 1
	if available <= 0 {
		return truncateUTF8Suffix(marker, b.maxBytes)
	}
	return truncateUTF8Suffix(value, available) + "\n" + marker
}

func streamCommand(reader io.Reader, onChunk func(string), builder *cappedStringBuilder, lock *sync.Mutex, streamGroup *sync.WaitGroup) {
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
		cmd := exec.Command(resolveWindowsCommandShell(exec.LookPath), "-NoLogo", "-NoProfile", "-NonInteractive", "-Command", commandText)
		cmd.Dir = repoPath
		return cmd
	}
	cmd := exec.Command("sh", "-lc", commandText)
	cmd.Dir = repoPath
	return cmd
}

func resolveWindowsCommandShell(lookPath func(string) (string, error)) string {
	if path, err := lookPath("pwsh.exe"); err == nil {
		return path
	}
	return "powershell.exe"
}
