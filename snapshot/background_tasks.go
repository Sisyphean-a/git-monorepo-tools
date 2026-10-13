package snapshot

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

type BackgroundTaskRequest struct {
	TaskID   string `json:"taskId"`
	RepoID   string `json:"repoId"`
	RepoName string `json:"repoName"`
	RepoPath string `json:"repoPath"`
	Name     string `json:"name"`
	Command  string `json:"command"`
	WorkDir  string `json:"workDir"`
}

type BackgroundTaskState struct {
	BackgroundTaskRequest
	RunID     int64  `json:"runId"`
	Revision  int64  `json:"revision"`
	Status    string `json:"status"`
	StartedAt int64  `json:"startedAt"`
	EndedAt   int64  `json:"endedAt"`
	ExitCode  *int   `json:"exitCode"`
	Error     string `json:"error"`
}

type taskKey struct{ repoID, taskID string }

type backgroundTask struct {
	state   BackgroundTaskState
	process *taskProcess
	log     taskLog
}

// BackgroundTasks 独占任务进程与有界日志；状态事件不携带日志，也不创建周期维护任务。
type BackgroundTasks struct {
	mu       sync.Mutex
	tasks    map[taskKey]*backgroundTask
	revision int64
	closed   bool
	workers  sync.WaitGroup
	emit     func(BackgroundTaskState)
}

func NewBackgroundTasks(emit func(BackgroundTaskState)) *BackgroundTasks {
	return &BackgroundTasks{tasks: make(map[taskKey]*backgroundTask), emit: emit}
}

func (m *BackgroundTasks) publish(task *backgroundTask) {
	m.revision++
	task.state.Revision = m.revision
	if m.emit != nil {
		m.emit(task.state)
	}
}

func (m *BackgroundTasks) List() []BackgroundTaskState {
	m.mu.Lock()
	defer m.mu.Unlock()
	states := make([]BackgroundTaskState, 0, len(m.tasks))
	for _, task := range m.tasks {
		states = append(states, task.state)
	}
	sort.Slice(states, func(i, j int) bool { return states[i].RunID < states[j].RunID })
	return states
}

func taskActive(status string) bool {
	return status == "running" || status == "stopping"
}

func (m *BackgroundTasks) Start(request BackgroundTaskRequest) (BackgroundTaskState, error) {
	request.TaskID = strings.TrimSpace(request.TaskID)
	request.RepoID = strings.TrimSpace(request.RepoID)
	request.Name = strings.TrimSpace(request.Name)
	request.Command = strings.TrimSpace(request.Command)
	if request.TaskID == "" || request.RepoID == "" || request.Name == "" || request.Command == "" {
		return BackgroundTaskState{}, errors.New("任务标识、项目、名称和命令不能为空")
	}
	directory, err := taskWorkingDirectory(request.RepoPath, request.WorkDir)
	if err != nil {
		return BackgroundTaskState{}, err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.closed {
		return BackgroundTaskState{}, errors.New("应用已关闭，不能启动后台任务")
	}
	key := taskKey{request.RepoID, request.TaskID}
	if existing := m.tasks[key]; existing != nil && taskActive(existing.state.Status) {
		return existing.state, nil
	}
	m.revision++
	task := &backgroundTask{state: BackgroundTaskState{BackgroundTaskRequest: request, RunID: m.revision, StartedAt: time.Now().UnixMilli()}}
	m.tasks[key] = task
	cmd := buildShellCommand(directory, request.Command)
	stdout, stdoutWriter, err := os.Pipe()
	if err != nil {
		return m.failStart(task, err)
	}
	stderr, stderrWriter, err := os.Pipe()
	if err != nil {
		stdout.Close()
		stdoutWriter.Close()
		return m.failStart(task, err)
	}
	cmd.Stdout, cmd.Stderr = stdoutWriter, stderrWriter
	// Rule: 不连接 stdin，非交互命令读到 EOF；需要输入的程序应在现有终端运行。
	task.process, err = startTaskProcess(cmd)
	stdoutWriter.Close()
	stderrWriter.Close()
	if err != nil {
		stdout.Close()
		stderr.Close()
		return m.failStart(task, err)
	}
	task.state.Status = "running"
	m.publish(task)
	m.workers.Add(1)
	go func() {
		defer m.workers.Done()
		defer stdout.Close()
		defer stderr.Close()
		var streamLock sync.Mutex
		var streams sync.WaitGroup
		streams.Add(2)
		appendOutput := func(text string) {
			m.mu.Lock()
			task.log.write(text)
			m.mu.Unlock()
		}
		out := taskOutputWriter{append: appendOutput}
		errOut := taskOutputWriter{append: appendOutput}
		go streamCommand(stdout, out.write, nil, &streamLock, &streams)
		go streamCommand(stderr, errOut.write, nil, &streamLock, &streams)
		waitErr := cmd.Wait()
		// Guarantee: 根进程退出也回收仍存活的后代，再读完管道尾部，最后发布结束状态。
		closeErr := task.process.close()
		streams.Wait()
		out.flush()
		errOut.flush()
		m.mu.Lock()
		defer m.mu.Unlock()
		code := -1
		if cmd.ProcessState != nil {
			code = cmd.ProcessState.ExitCode()
		}
		task.state.ExitCode = &code
		task.state.EndedAt = time.Now().UnixMilli()
		if task.state.Status == "stopping" && closeErr == nil {
			task.state.Status = "stopped"
		} else if waitErr != nil || closeErr != nil {
			task.state.Status = "failed"
			task.state.Error = errors.Join(waitErr, closeErr).Error()
		} else {
			task.state.Status = "exited"
		}
		m.publish(task)
	}()
	return task.state, nil
}

func (m *BackgroundTasks) failStart(task *backgroundTask, err error) (BackgroundTaskState, error) {
	task.state.Status = "failed"
	task.state.Error = err.Error()
	task.state.EndedAt = time.Now().UnixMilli()
	m.publish(task)
	return task.state, err
}

func (m *BackgroundTasks) Stop(repoID, taskID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	task := m.tasks[taskKey{repoID, taskID}]
	if task == nil || !taskActive(task.state.Status) {
		return errors.New("后台任务已结束或不存在")
	}
	if task.state.Status == "stopping" {
		return errors.New("后台任务正在停止")
	}
	if err := task.process.stop(); err != nil {
		task.state.Error = fmt.Sprintf("停止后台任务失败：%v", err)
		m.publish(task)
		return errors.New(task.state.Error)
	}
	task.state.Status = "stopping"
	task.state.Error = ""
	m.publish(task)
	return nil
}

func (m *BackgroundTasks) ReadLog(repoID, taskID string, runID, cursor int64) (BackgroundTaskLog, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	task := m.tasks[taskKey{repoID, taskID}]
	if task == nil {
		return BackgroundTaskLog{}, errors.New("后台任务不存在")
	}
	if task.state.RunID != runID {
		return BackgroundTaskLog{}, errors.New("后台任务已重新启动，请读取新会话")
	}
	return task.log.read(cursor), nil
}

func (m *BackgroundTasks) Forget(repoID, taskID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	key := taskKey{repoID, taskID}
	if task := m.tasks[key]; task != nil && taskActive(task.state.Status) {
		return errors.New("请先停止任务再删除配置")
	}
	delete(m.tasks, key)
	return nil
}

func (m *BackgroundTasks) Close() error {
	m.mu.Lock()
	m.closed = true
	var failures []error
	for _, task := range m.tasks {
		if taskActive(task.state.Status) {
			if err := task.process.stop(); err != nil {
				failures = append(failures, err)
			} else {
				task.state.Status = "stopping"
			}
		}
	}
	m.mu.Unlock()
	if len(failures) > 0 {
		return errors.Join(failures...)
	}
	m.workers.Wait()
	m.mu.Lock()
	clear(m.tasks)
	m.mu.Unlock()
	return nil
}

func taskWorkingDirectory(repoPath, relative string) (string, error) {
	if strings.TrimSpace(repoPath) == "" {
		return "", errors.New("缺少项目目录")
	}
	root, err := filepath.Abs(repoPath)
	if err != nil {
		return "", err
	}
	root, err = filepath.EvalSymlinks(root)
	if err != nil {
		return "", fmt.Errorf("读取项目目录失败：%w", err)
	}
	if filepath.IsAbs(relative) || filepath.VolumeName(relative) != "" {
		return "", errors.New("工作目录必须是项目内的相对路径")
	}
	directory, err := filepath.EvalSymlinks(filepath.Join(root, relative))
	if err != nil {
		return "", fmt.Errorf("读取任务工作目录失败：%w", err)
	}
	within, err := filepath.Rel(root, directory)
	if err != nil || within == ".." || strings.HasPrefix(within, ".."+string(filepath.Separator)) {
		return "", errors.New("任务工作目录不能越出项目")
	}
	info, err := os.Stat(directory)
	if err != nil {
		return "", err
	}
	if !info.IsDir() {
		return "", errors.New("任务工作目录不是目录")
	}
	return directory, nil
}
