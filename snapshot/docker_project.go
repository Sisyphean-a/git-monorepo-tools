package snapshot

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"slices"
	"sort"
	"strconv"
	"strings"
	"time"
)

type DockerFiles struct {
	Compose    string `json:"compose,omitempty"`
	Dockerfile string `json:"dockerfile,omitempty"`
}

func findDockerFiles(root string) DockerFiles {
	return DockerFiles{
		Compose:    firstDockerFile(root, "compose.yaml", "compose.yml", "docker-compose.yaml", "docker-compose.yml"),
		Dockerfile: firstDockerFile(root, "Dockerfile"),
	}
}

func firstDockerFile(root string, names ...string) string {
	for _, name := range names {
		if info, err := os.Stat(filepath.Join(root, name)); err == nil && info.Mode().IsRegular() {
			return name
		}
	}
	return ""
}

type DockerProject struct {
	Files    DockerFiles         `json:"files"`
	Engine   string              `json:"engine"`
	Error    string              `json:"error,omitempty"`
	Services []DockerService     `json:"services"`
	Image    *DockerProjectImage `json:"image,omitempty"`
}

type DockerService struct {
	Name       string             `json:"name"`
	Buildable  bool               `json:"buildable"`
	Image      DockerProjectImage `json:"image"`
	Containers []DockerContainer  `json:"containers"`
	zeroScale  bool
	pullPolicy string
}

type DockerProjectImage struct {
	Name string `json:"name"`
	ID   string `json:"id,omitempty"`
}

type DockerContainer struct {
	Name       string   `json:"name"`
	State      string   `json:"state"`
	Health     string   `json:"health,omitempty"`
	OtherImage bool     `json:"otherImage,omitempty"`
	LocalPorts []string `json:"localPorts,omitempty"`
	service    string
	imageID    string
	manifest   dockerImageManifest
}

type dockerImageManifest struct {
	Digest   string `json:"digest"`
	Platform struct {
		OS, Architecture, Variant string
	} `json:"platform"`
}

type dockerImageVariant struct{ imageID, platform string }

type dockerRunner func(context.Context, string, io.Writer, io.Writer, ...string) error

type dockerTarget struct {
	root            string
	files           DockerFiles
	prefix          []string
	builder         string
	compose         []string
	project         string
	inspectPlatform bool
	run             dockerRunner
}

const dockerReadTimeout = 15 * time.Second

func dockerRepoRoot(repoID, repoPath string) (string, error) {
	root, ok, err := validateRepoPathHint(repoID, repoPath)
	if err != nil {
		return "", err
	}
	if !ok || !filepath.IsAbs(repoPath) || !isGitRepo(root) {
		return "", errors.New("当前仓库路径无效或已不存在")
	}
	return root, nil
}

func (d *DockerProjects) Inspect(repoID, repoPath string) (DockerProject, error) {
	root, err := dockerRepoRoot(repoID, repoPath)
	if err != nil {
		return DockerProject{}, err
	}
	ctx, cancel := context.WithTimeout(d.ctx, dockerReadTimeout)
	defer cancel()
	target, project := d.prepare(ctx, root)
	if project.Engine != "ready" || project.Error != "" {
		return project, nil
	}
	if project.Image != nil {
		project.Image.ID, err = target.imageID(ctx, project.Image.Name)
	} else {
		err = target.loadServiceState(ctx, project.Services)
	}
	if err != nil {
		project.Error = err.Error()
	}
	return project, nil
}

func (d *DockerProjects) prepare(ctx context.Context, root string) (dockerTarget, DockerProject) {
	files := findDockerFiles(root)
	target := dockerTarget{root: root, files: files}
	project := DockerProject{Files: files, Engine: "no-config", Services: []DockerService{}}
	if files == (DockerFiles{}) {
		return target, project
	}
	target.run = d.run
	if target.run == nil {
		binary, err := exec.LookPath("docker")
		if err != nil {
			project.Engine = "missing-cli"
			project.Error = err.Error()
			return target, project
		}
		env := os.Environ()
		target.run = func(ctx context.Context, dir string, out, stderr io.Writer, args ...string) error {
			cmd := exec.CommandContext(ctx, binary, args...)
			cmd.Dir, cmd.Stdout, cmd.Stderr = dir, out, stderr
			cmd.Env = env
			if len(args) > 0 && args[0] == "--host" {
				cmd.Env = slices.DeleteFunc(slices.Clone(env), func(entry string) bool {
					key, _, _ := strings.Cut(entry, "=")
					switch strings.ToUpper(key) {
					case "DOCKER_CONTEXT", "DOCKER_HOST", "BUILDX_BUILDER", "BUILDKIT_HOST", "COMPOSE_BAKE", "COMPOSE_REMOVE_ORPHANS":
						return true
					}
					return false
				})
				cmd.Env = append(cmd.Env, "COMPOSE_BAKE=false", "COMPOSE_REMOVE_ORPHANS=false")
			}
			cmd.Cancel = func() error { return defaultTerminateCommandTree(cmd) }
			cmd.WaitDelay = 2 * time.Second
			applyBackgroundProcessAttrs(cmd)
			return cmd.Run()
		}
	}
	if err := target.checkEngine(ctx, d.getEnv); err != nil {
		project.Engine = "unreachable"
		if errors.Is(err, errRemoteDocker) {
			project.Engine = "non-local"
		}
		project.Error = err.Error()
		return target, project
	}
	project.Engine = "ready"
	if files.Compose == "" {
		id := repoIDForPath(root)
		slug := id[:strings.LastIndexByte(id, '-')]
		hash := sha256.Sum256([]byte(root))
		project.Image = &DockerProjectImage{Name: fmt.Sprintf("repo-%s-%x:local", strings.TrimRight(slug[:min(len(slug), 60)], "-"), hash[:8])}
		return target, project
	}
	if _, err := target.capture(ctx, "compose", "version", "--short"); err != nil {
		project.Engine, project.Error = "missing-compose", err.Error()
		return target, project
	}
	services, err := target.loadCompose(ctx)
	if err != nil {
		project.Error = err.Error()
	} else {
		project.Services = services
	}
	return target, project
}

var errRemoteDocker = errors.New("当前 Docker 连接不是本地 Unix 套接字或 Windows 命名管道")

func (t *dockerTarget) checkEngine(ctx context.Context, env func(string) string) error {
	contextName, host := env("DOCKER_CONTEXT"), env("DOCKER_HOST")
	if contextName != "" || host == "" {
		if contextName == "" {
			name, err := t.capture(ctx, "context", "show")
			if err != nil {
				return err
			}
			contextName = strings.TrimSpace(name)
		}
		endpoint, err := t.capture(ctx, "context", "inspect", "--format", "{{.Endpoints.docker.Host}}", "--", contextName)
		if err != nil {
			return err
		}
		host = strings.TrimSpace(endpoint)
	}
	if !strings.HasPrefix(host, "unix:///") && !strings.HasPrefix(strings.ToLower(host), "npipe:////./pipe/") {
		return errRemoteDocker
	}
	// Guarantee: 后续命令固定到已检查的套接字，避免 Docker 上下文切换改变操作目标。
	t.prefix, t.builder = []string{"--host", host}, "default"
	version, err := t.capture(ctx, "version", "--format", "{{.Server.Version}} {{.Client.APIVersion}} {{.Server.APIVersion}}")
	if err != nil {
		return err
	}
	fields := strings.Fields(version)
	if len(fields) != 3 {
		return errors.New("Docker 未返回完整的引擎版本")
	}
	t.inspectPlatform = supportsDockerPlatformInspect(fields[1]) && supportsDockerPlatformInspect(fields[2])
	return nil
}

func supportsDockerPlatformInspect(apiVersion string) bool {
	major, minor, _ := strings.Cut(apiVersion, ".")
	x, xerr := strconv.Atoi(major)
	y, yerr := strconv.Atoi(minor)
	// Rule: image inspect --platform 需要 Docker API 1.49；旧引擎仍用普通镜像 ID 比较。
	return xerr == nil && yerr == nil && (x > 1 || (x == 1 && y >= 49))
}

func (t *dockerTarget) loadCompose(ctx context.Context) ([]DockerService, error) {
	t.compose = []string{"compose", "--ansi", "never", "--progress", "plain", "--project-directory", t.root, "-f", filepath.Join(t.root, t.files.Compose)}
	overrides := []string{"compose.override.yaml", "compose.override.yml"}
	if strings.HasPrefix(t.files.Compose, "docker-compose.") {
		overrides = []string{"docker-compose.override.yaml", "docker-compose.override.yml"}
	}
	if override := firstDockerFile(t.root, overrides...); override != "" {
		t.compose = append(t.compose, "-f", filepath.Join(t.root, override))
	}
	out, err := t.capture(ctx, t.composeArgs("config", "--format", "json")...)
	if err != nil {
		return nil, fmt.Errorf("读取 Compose 配置失败：%w", err)
	}
	var config struct {
		Name     string
		Services map[string]struct {
			Image      string
			Build      json.RawMessage
			Scale      *int
			PullPolicy string `json:"pull_policy"`
			Deploy     struct{ Replicas *int }
		}
	}
	if err := json.Unmarshal([]byte(out), &config); err != nil || config.Name == "" {
		return nil, errors.New("无法读取 Compose 项目名或服务列表")
	}
	t.project = config.Name
	t.compose = append(t.compose, "--project-name", config.Name)
	services := make([]DockerService, 0, len(config.Services))
	for name, service := range config.Services {
		image := service.Image
		if image == "" {
			image = config.Name + "-" + name
		}
		services = append(services, DockerService{
			Name: name, Buildable: len(service.Build) > 0 && string(service.Build) != "null",
			Image: DockerProjectImage{Name: image}, Containers: []DockerContainer{},
			zeroScale:  (service.Scale != nil && *service.Scale == 0) || (service.Deploy.Replicas != nil && *service.Deploy.Replicas == 0),
			pullPolicy: service.PullPolicy,
		})
	}
	sort.Slice(services, func(i, j int) bool { return services[i].Name < services[j].Name })
	return services, nil
}

func (t dockerTarget) composeArgs(args ...string) []string {
	return append(slices.Clone(t.compose), args...)
}

func (t dockerTarget) imageID(ctx context.Context, name string) (string, error) {
	out, err := t.capture(ctx, "image", "inspect", "--format", "{{.Id}}", "--", name)
	if err != nil && strings.Contains(strings.ToLower(err.Error()), "no such image") {
		return "", nil
	}
	return strings.TrimSpace(out), err
}

func (t dockerTarget) matchesImage(ctx context.Context, c DockerContainer, id string, variants map[dockerImageVariant]string) (bool, error) {
	if c.imageID == id || c.manifest.Digest == id {
		return true, nil
	}
	if c.manifest.Digest == "" {
		return false, nil
	}
	platform := c.manifest.Platform
	if platform.OS == "" || platform.Architecture == "" {
		return false, fmt.Errorf("容器 %s 缺少镜像平台信息，无法核对镜像", c.Name)
	}
	key := dockerImageVariant{imageID: id, platform: platform.OS + "/" + platform.Architecture}
	if platform.Variant != "" {
		key.platform += "/" + platform.Variant
	}
	if _, ok := variants[key]; !ok {
		// Rule: 标签可能解析成 OCI 索引，容器运行的是平台清单；始终从已捕获的 ID 解析，避免读到后来改指的标签。
		out, err := t.capture(ctx, "image", "inspect", "--platform", key.platform, "--format", "{{.Id}}", "--", id)
		if err != nil {
			return false, fmt.Errorf("核对容器 %s 的 %s 镜像失败：%w", c.Name, key.platform, err)
		}
		variants[key] = strings.TrimSpace(out)
	}
	return c.manifest.Digest == variants[key], nil
}

func (t dockerTarget) loadServiceState(ctx context.Context, services []DockerService) error {
	containers, err := t.projectContainers(ctx)
	if err != nil {
		return err
	}
	images := make(map[string]string)
	variants := make(map[dockerImageVariant]string)
	for i := range services {
		service := &services[i]
		id, known := images[service.Image.Name]
		if !known {
			id, err = t.imageID(ctx, service.Image.Name)
			if err != nil {
				return fmt.Errorf("读取镜像 %s 失败：%w", service.Image.Name, err)
			}
			images[service.Image.Name] = id
		}
		service.Image.ID = id
		for _, container := range containers {
			if container.service == service.Name {
				if id != "" {
					matches, err := t.matchesImage(ctx, container, id, variants)
					if err != nil {
						return err
					}
					container.OtherImage = !matches
				}
				service.Containers = append(service.Containers, container)
			}
		}
	}
	return nil
}

// Rule: Compose 的项目名在引擎内共享；操作前核对所有同名项目容器的工作目录，不能仅按名称归属。
func (t dockerTarget) projectContainers(ctx context.Context) ([]DockerContainer, error) {
	out, err := t.capture(ctx, "container", "ls", "--all", "--quiet", "--no-trunc", "--filter", "label=com.docker.compose.project="+t.project)
	if err != nil {
		return nil, err
	}
	var result []DockerContainer
	ids := strings.Fields(out)
	template := `[{{json .Name}},{{json .Image}},{{json .State.Status}},{{if .State.Health}}{{json .State.Health.Status}}{{else}}""{{end}},{{json .NetworkSettings.Ports}},{{json (index .Config.Labels "com.docker.compose.project.working_dir")}},{{json (index .Config.Labels "com.docker.compose.service")}},{{json (index .Config.Labels "com.docker.compose.oneoff")}}`
	if t.inspectPlatform {
		template += `,{{json .ImageManifestDescriptor}}`
	}
	template += `]`
	for len(ids) > 0 {
		n := min(32, len(ids))
		data, err := t.capture(ctx, append([]string{"container", "inspect", "--format", template, "--"}, ids[:n]...)...)
		if err != nil {
			return nil, err
		}
		rows := strings.Split(strings.TrimSpace(data), "\n")
		if len(rows) != n {
			return nil, errors.New("Docker 未返回完整的容器状态")
		}
		for _, row := range rows {
			container, err := t.parseContainer(row)
			if err != nil {
				return nil, err
			}
			if container != nil {
				result = append(result, *container)
			}
		}
		ids = ids[n:]
	}
	sort.Slice(result, func(i, j int) bool { return result[i].Name < result[j].Name })
	return result, nil
}

func (t dockerTarget) parseContainer(row string) (*DockerContainer, error) {
	var c DockerContainer
	var owner, oneOff string
	var ports map[string][]struct{ HostIP, HostPort string }
	fields := []any{&c.Name, &c.imageID, &c.State, &c.Health, &ports, &owner, &c.service, &oneOff}
	if t.inspectPlatform {
		fields = append(fields, &c.manifest)
	}
	var raw []json.RawMessage
	if err := json.Unmarshal([]byte(row), &raw); err != nil || len(raw) != len(fields) {
		return nil, errors.New("无法解析 Docker 容器状态")
	}
	for i, field := range fields {
		if err := json.Unmarshal(raw[i], field); err != nil {
			return nil, fmt.Errorf("无法解析 Docker 容器状态：%w", err)
		}
	}
	ownerPath := filepath.Clean(filepath.FromSlash(owner))
	rootPath := filepath.Clean(filepath.FromSlash(t.root))
	if ownerPath != rootPath && !(runtime.GOOS == "windows" && strings.EqualFold(ownerPath, rootPath)) {
		return nil, fmt.Errorf("已有同名 Compose 项目 %q 不属于当前仓库；请核对 Compose 项目名", t.project)
	}
	if strings.EqualFold(oneOff, "true") {
		return nil, nil
	}
	c.Name = strings.TrimPrefix(c.Name, "/")
	if c.State == "running" {
		for port, bindings := range ports {
			if !strings.HasSuffix(port, "/tcp") {
				continue
			}
			for _, binding := range bindings {
				switch binding.HostIP {
				case "127.0.0.1", "0.0.0.0":
					c.LocalPorts = append(c.LocalPorts, "127.0.0.1:"+binding.HostPort)
				case "::1", "::":
					c.LocalPorts = append(c.LocalPorts, "[::1]:"+binding.HostPort)
				}
			}
		}
		sort.Strings(c.LocalPorts)
		c.LocalPorts = slices.Compact(c.LocalPorts)
	}
	return &c, nil
}

func (t dockerTarget) capture(ctx context.Context, args ...string) (string, error) {
	out := dockerCapture{remaining: 4 * 1024 * 1024}
	stderr := dockerCapture{remaining: 16 * 1024}
	err := t.run(ctx, t.root, &out, &stderr, append(slices.Clone(t.prefix), args...)...)
	if err != nil {
		return "", dockerCommandError(ctx, err, stderr.String())
	}
	if out.overflow {
		return "", errors.New("Docker 返回的数据过大，无法完整读取")
	}
	return out.String(), nil
}

func dockerCommandError(ctx context.Context, err error, detail string) error {
	if ctx.Err() != nil {
		return fmt.Errorf("Docker 命令未完成：%w", ctx.Err())
	}
	if detail = strings.TrimSpace(detail); detail != "" {
		return fmt.Errorf("%w：%s", err, detail)
	}
	return err
}

type dockerCapture struct {
	bytes.Buffer
	remaining int
	overflow  bool
}

func (c *dockerCapture) Write(data []byte) (int, error) {
	n := min(len(data), c.remaining)
	_, _ = c.Buffer.Write(data[:n])
	c.remaining -= n
	c.overflow = c.overflow || n < len(data)
	return len(data), nil
}
