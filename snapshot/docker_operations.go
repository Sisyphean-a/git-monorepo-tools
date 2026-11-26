package snapshot

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"time"
)

type DockerOperation struct {
	ID        uint64 `json:"id"`
	Action    string `json:"action"`
	Service   string `json:"service,omitempty"`
	Stage     string `json:"stage"`
	Status    string `json:"status"`
	Error     string `json:"error,omitempty"`
	Output    string `json:"output,omitempty"`
	Truncated bool   `json:"truncated,omitempty"`
}

type DockerOutput struct {
	Text      string `json:"text"`
	Truncated bool   `json:"truncated"`
}

type DockerProjects struct {
	ctx    context.Context
	cancel context.CancelFunc
	run    dockerRunner
	getEnv func(string) string

	mu     sync.Mutex
	serial uint64
	latest *dockerOperation
}

type dockerOperation struct {
	repoID string
	state  DockerOperation
	log    taskLog
	done   chan struct{}
}

func NewDockerProjects() *DockerProjects {
	ctx, cancel := context.WithCancel(context.Background())
	return &DockerProjects{ctx: ctx, cancel: cancel, getEnv: os.Getenv}
}

func (d *DockerProjects) Close() {
	d.mu.Lock()
	d.cancel()
	latest := d.latest
	d.mu.Unlock()
	if latest != nil {
		<-latest.done
	}
}

func (d *DockerProjects) Operation(repoID string, includeOutput bool) *DockerOperation {
	d.mu.Lock()
	defer d.mu.Unlock()
	if d.latest == nil || d.latest.repoID != repoID {
		return nil
	}
	state := d.latest.state
	if includeOutput {
		log := d.latest.log.read(0)
		state.Output, state.Truncated = log.Text, log.Truncated
	}
	return &state
}

func (d *DockerProjects) Start(repoID, repoPath, action, service string) (DockerOperation, error) {
	root, err := dockerRepoRoot(repoID, repoPath)
	if err != nil {
		return DockerOperation{}, err
	}
	switch action {
	case "update":
		if service != "" {
			return DockerOperation{}, errors.New("更新作用于当前 Compose 项目")
		}
	case "build", "start", "stop", "restart":
	default:
		return DockerOperation{}, errors.New("未知 Docker 操作")
	}

	d.mu.Lock()
	defer d.mu.Unlock()
	if d.ctx.Err() != nil {
		return DockerOperation{}, errors.New("应用正在关闭")
	}
	// Rule: 同一引擎内的变更串行，避免两个同名 Compose 项目同时通过归属检查。
	if d.latest != nil && d.latest.state.Status == "running" {
		return DockerOperation{}, errors.New("另一个 Docker 操作仍在执行，请完成后重试")
	}
	d.serial++
	state := DockerOperation{ID: d.serial, Action: action, Service: service, Stage: "prepare", Status: "running"}
	op := &dockerOperation{repoID: repoID, state: state, done: make(chan struct{})}
	d.latest = op
	go func() {
		defer close(op.done)
		err := d.execute(root, op, action, service)
		d.mu.Lock()
		defer d.mu.Unlock()
		if err != nil {
			op.state.Status, op.state.Error = "failed", err.Error()
		} else {
			op.state.Status = "succeeded"
		}
	}()
	return state, nil
}

func (d *DockerProjects) Logs(repoID, repoPath, service string) (DockerOutput, error) {
	root, err := dockerRepoRoot(repoID, repoPath)
	if err != nil {
		return DockerOutput{}, err
	}
	ctx, cancel := context.WithTimeout(d.ctx, dockerReadTimeout)
	defer cancel()
	target, project := d.prepare(ctx, root)
	if err := requireReady(project); err != nil {
		return DockerOutput{}, err
	}
	if _, err := requireDockerService(project, service); err != nil {
		return DockerOutput{}, err
	}
	if _, err := target.projectContainers(ctx); err != nil {
		return DockerOutput{}, err
	}
	var log taskLog
	out := newDockerLogWriter(log.write)
	err = target.run(ctx, root, out, out, append(slices.Clone(target.prefix), target.composeArgs("logs", "--no-color", "--tail", "100", "--", service)...)...)
	out.flush()
	if err != nil {
		return DockerOutput{}, dockerCommandError(ctx, err, lastDockerLines(log.read(0).Text))
	}
	result := log.read(0)
	return DockerOutput{Text: result.Text, Truncated: result.Truncated}, nil
}

func requireReady(project DockerProject) error {
	if project.Error != "" {
		return errors.New(project.Error)
	}
	if project.Engine != "ready" {
		return errors.New("当前仓库未检测到 Compose 配置或 Dockerfile")
	}
	return nil
}

func requireDockerService(project DockerProject, name string) (DockerService, error) {
	for _, service := range project.Services {
		if service.Name == name {
			return service, nil
		}
	}
	return DockerService{}, errors.New("当前 Compose 配置不包含所选服务")
}

func (d *DockerProjects) execute(root string, op *dockerOperation, action, service string) error {
	preparation, cancel := context.WithTimeout(d.ctx, dockerReadTimeout)
	target, project := d.prepare(preparation, root)
	if err := requireReady(project); err != nil {
		cancel()
		return err
	}
	var containers []DockerContainer
	if target.files.Compose != "" {
		var err error
		containers, err = target.checkOwnership(preparation, action == "update")
		if err != nil {
			cancel()
			return err
		}
	}
	cancel()

	step := func(stage string, args ...string) error {
		d.setDockerStage(op, stage)
		var stepLog taskLog
		out := newDockerLogWriter(func(text string) {
			stepLog.write(text)
			d.mu.Lock()
			op.log.write(text)
			d.mu.Unlock()
		})
		err := target.run(d.ctx, root, out, out, append(slices.Clone(target.prefix), args...)...)
		out.flush()
		if err != nil {
			tail := stepLog.read(0).Text
			return dockerCommandError(d.ctx, err, lastDockerLines(tail))
		}
		return nil
	}
	if target.files.Compose == "" {
		if action != "build" || service != "" {
			return errors.New("只有 Dockerfile 的仓库仅支持构建镜像")
		}
		return step("build", "build", "--builder", target.builder, "--progress", "plain", "--tag", project.Image.Name, "--file", filepath.Join(root, target.files.Dockerfile), root)
	}
	if action == "update" {
		if len(project.Services) == 0 {
			return errors.New("Compose 未定义可启动的服务")
		}
		if slices.ContainsFunc(project.Services, func(s DockerService) bool { return s.Buildable }) {
			if err := step("build", target.composeArgs("build", "--builder", target.builder)...); err != nil {
				return err
			}
		}
		d.setDockerStage(op, "launch")
		wanted, missing, err := d.prepareDockerLaunch(target, project.Services)
		if err != nil {
			return err
		}
		// Rule: Compose 的 missing 策略仍可拉取 latest，不能让启动覆盖刚构建的同名镜像。
		if len(missing) != 0 {
			if err := step("launch", target.composeArgs(append([]string{"pull", "--ignore-buildable", "--policy", "missing", "--"}, missing...)...)...); err != nil {
				return err
			}
			ctx, cancel := context.WithTimeout(d.ctx, dockerReadTimeout)
			_, err := target.checkOwnership(ctx, true)
			cancel()
			if err != nil {
				return err
			}
		}
		if err := step("launch", target.composeArgs("up", "--detach", "--no-build", "--pull", "never")...); err != nil {
			return err
		}
		return d.checkDockerHealth(target, op, project.Services, wanted)
	}

	selected, err := requireDockerService(project, service)
	if err != nil {
		return err
	}
	if action == "build" {
		if !selected.Buildable {
			return errors.New("所选服务没有镜像构建配置")
		}
		return step("build", target.composeArgs("build", "--builder", target.builder, "--", service)...)
	}
	if !slices.ContainsFunc(containers, func(c DockerContainer) bool { return c.service == service }) {
		return errors.New("容器尚未创建；请先构建并启动服务")
	}
	if err := step(action, target.composeArgs(action, "--", service)...); err != nil {
		return err
	}
	if action != "stop" {
		selected.zeroScale = false
		return d.checkDockerHealth(target, op, []DockerService{selected}, nil)
	}
	return nil
}

func (d *DockerProjects) setDockerStage(op *dockerOperation, stage string) {
	d.mu.Lock()
	op.state.Stage = stage
	d.mu.Unlock()
}

func (t dockerTarget) checkOwnership(ctx context.Context, createsContainers bool) ([]DockerContainer, error) {
	containers, err := t.projectContainers(ctx)
	if err != nil || !createsContainers || len(containers) > 0 {
		return containers, err
	}
	for _, kind := range []string{"volume", "network"} {
		out, err := t.capture(ctx, kind, "ls", "--quiet", "--filter", "label=com.docker.compose.project="+t.project)
		if err != nil {
			return nil, err
		}
		if strings.TrimSpace(out) != "" {
			return nil, fmt.Errorf("同名 Compose 项目 %q 留有数据卷或网络，无法确认归属。请在终端确认后启动，未清理任何资源", t.project)
		}
	}
	return containers, nil
}

func (d *DockerProjects) prepareDockerLaunch(target dockerTarget, services []DockerService) (map[string]string, []string, error) {
	ctx, cancel := context.WithTimeout(d.ctx, dockerReadTimeout)
	defer cancel()
	// Rule: 构建可能耗时很久，启动前重新确认归属并固定本轮构建结果。
	if _, err := target.checkOwnership(ctx, true); err != nil {
		return nil, nil, err
	}
	wanted := make(map[string]string)
	var missing []string
	for _, service := range services {
		if service.zeroScale {
			continue
		}
		id, err := target.imageID(ctx, service.Image.Name)
		if err != nil {
			return nil, nil, err
		}
		if id == "" {
			if service.Buildable {
				return nil, nil, fmt.Errorf("找不到服务 %s 构建后的镜像", service.Name)
			}
			if service.pullPolicy == "never" {
				return nil, nil, fmt.Errorf("服务 %s 缺少本地镜像，且 Compose 配置不允许拉取", service.Name)
			}
			missing = append(missing, service.Name)
		} else if service.Buildable {
			wanted[service.Name] = id
		}
	}
	return wanted, missing, nil
}

func (d *DockerProjects) checkDockerHealth(target dockerTarget, op *dockerOperation, services []DockerService, wanted map[string]string) error {
	d.setDockerStage(op, "health")
	ctx, cancel := context.WithTimeout(d.ctx, 90*time.Second)
	defer cancel()
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	variants := make(map[dockerImageVariant]string)
	for {
		containers, err := target.projectContainers(ctx)
		if err != nil {
			return err
		}
		pending := false
		for _, service := range services {
			if service.zeroScale {
				continue
			}
			found := false
			for _, c := range containers {
				if c.service != service.Name {
					continue
				}
				found = true
				if id := wanted[service.Name]; id != "" {
					matches, err := target.matchesImage(ctx, c, id, variants)
					if err != nil {
						return err
					}
					if !matches {
						return fmt.Errorf("容器 %s 未使用本地镜像 %s", c.Name, service.Image.Name)
					}
				}
				switch {
				case c.State == "restarting" || (c.State == "running" && c.Health == "starting"):
					pending = true
				case c.State != "running":
					return fmt.Errorf("容器 %s 未运行（%s），请查看容器日志", c.Name, c.State)
				case c.Health != "" && c.Health != "healthy":
					return fmt.Errorf("容器 %s 健康检查未通过（%s），请查看容器日志", c.Name, c.Health)
				}
			}
			if !found {
				return fmt.Errorf("服务 %s 未创建容器", service.Name)
			}
		}
		if !pending {
			return nil
		}
		select {
		case <-ctx.Done():
			return fmt.Errorf("等待容器就绪未完成：%w", ctx.Err())
		case <-ticker.C:
		}
	}
}

func lastDockerLines(text string) string {
	text = strings.ToValidUTF8(text[max(0, len(text)-2048):], "�")
	lines := strings.Split(strings.TrimSpace(text), "\n")
	return strings.Join(lines[max(0, len(lines)-3):], "\n")
}

type dockerLogWriter struct {
	ansiStripper
	utf8 taskOutputWriter
}

func newDockerLogWriter(append func(string)) *dockerLogWriter {
	return &dockerLogWriter{utf8: taskOutputWriter{append: append}}
}

func (w *dockerLogWriter) Write(data []byte) (int, error) {
	w.utf8.write(w.ansiStripper.Write(string(data)))
	return len(data), nil
}

func (w *dockerLogWriter) flush() { w.utf8.flush() }
