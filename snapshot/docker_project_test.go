package snapshot

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"
)

func TestDockerFilesAreScopedToRepoRoot(t *testing.T) {
	root := dockerTestRepo(t, "Dockerfile", "docker-compose.yml", "compose.yaml")
	if got := findDockerFiles(root); got != (DockerFiles{Compose: "compose.yaml", Dockerfile: "Dockerfile"}) {
		t.Fatalf("unexpected root files: %#v", got)
	}
	parent := filepath.Dir(root)
	if err := os.WriteFile(filepath.Join(parent, ".dockerignore"), nil, 0600); err != nil {
		t.Fatal(err)
	}
	if got := findDockerFiles(parent); got != (DockerFiles{}) {
		t.Fatalf("nested Docker files must not reveal parent tab: %#v", got)
	}
}

func TestDockerProjectShowsImageAndContainerIndependently(t *testing.T) {
	root := dockerTestRepo(t, "compose.yaml", "compose.override.yml")
	fake := &dockerTestCLI{owner: root, withContainer: true}
	manager := fake.manager(t)
	project, err := manager.Inspect(repoIDForPath(root), root)
	if err != nil || project.Engine != "ready" || project.Error != "" || len(project.Services) != 1 {
		t.Fatalf("inspect = %#v, %v", project, err)
	}
	service := project.Services[0]
	if service.Name != "h5-log" || !service.Buildable || service.Image.ID != "sha256:new" || len(service.Containers) != 1 {
		t.Fatalf("unexpected service: %#v", service)
	}
	container := service.Containers[0]
	if !container.OtherImage || container.Health != "healthy" || !slices.Equal(container.LocalPorts, []string{"127.0.0.1:3685"}) {
		t.Fatalf("unexpected container: %#v", container)
	}
	if !fake.configUsedOverride {
		t.Fatal("existing standard override was not included")
	}
	log, err := manager.Logs(repoIDForPath(root), root, "h5-log")
	if err != nil || log.Text != "h5-log | ready\n" {
		t.Fatalf("logs = %#v, %v", log, err)
	}
}

func TestDockerProjectComparesTheRunningPlatformOfAnImageIndex(t *testing.T) {
	for _, old := range []bool{false, true} {
		name := "current platform"
		if old {
			name = "outdated platform"
		}
		t.Run(name, func(t *testing.T) {
			root := dockerTestRepo(t, "compose.yaml")
			fake := &dockerTestCLI{owner: root, withContainer: true, indexImage: true, forceOldImage: old, postLaunchHealth: "healthy"}
			manager := fake.manager(t)
			project, err := manager.Inspect(repoIDForPath(root), root)
			if err != nil || project.Error != "" || len(project.Services) != 1 || len(project.Services[0].Containers) != 1 {
				t.Fatalf("inspect = %#v, %v", project, err)
			}
			if got := project.Services[0].Containers[0].OtherImage; got != old {
				t.Fatalf("image mismatch = %t, want %t", got, old)
			}
			result := dockerTestOperation(t, manager, root, "update", "")
			want := "succeeded"
			if old {
				want = "failed"
			}
			if result.Stage != "health" || result.Status != want {
				t.Fatalf("update = %#v, want %s", result, want)
			}
		})
	}
}

func TestDockerProjectDoesNotConnectToRemoteEngine(t *testing.T) {
	root := dockerTestRepo(t, "compose.yaml")
	fake := &dockerTestCLI{endpoint: "ssh://user@production"}
	manager := fake.manager(t)
	project, err := manager.Inspect(repoIDForPath(root), root)
	if err != nil || project.Engine != "non-local" || fake.engineCalls != 0 {
		t.Fatalf("remote engine not isolated: %#v, %v, engine calls: %d", project, err, fake.engineCalls)
	}
	if _, err := manager.Inspect("wrong-repo", root); err == nil {
		t.Fatal("repository identifier/path mismatch accepted")
	}
}

func TestDockerProjectExplainsUnavailableEngineAndCompose(t *testing.T) {
	root := dockerTestRepo(t, "compose.yaml")
	for _, tc := range []struct {
		want    string
		fixture *dockerTestCLI
	}{
		{"unreachable", &dockerTestCLI{engineError: true}},
		{"missing-compose", &dockerTestCLI{composeMissing: true}},
	} {
		t.Run(tc.want, func(t *testing.T) {
			manager := tc.fixture.manager(t)
			project, err := manager.Inspect(repoIDForPath(root), root)
			if err != nil || project.Engine != tc.want || project.Error == "" || project.Files.Compose == "" {
				t.Fatalf("inspect = %#v, %v", project, err)
			}
		})
	}
}

func TestDockerProjectUpdatesOrStopsAtActualFailureStage(t *testing.T) {
	for _, tc := range []struct {
		name, stage, status string
		buildError          bool
		launchError         bool
		postLaunchHealth    string
		forceOldImage       bool
		wantCommands        []string
	}{
		{name: "success", stage: "health", status: "succeeded", postLaunchHealth: "healthy", wantCommands: []string{"build", "up"}},
		{name: "build failure keeps existing container", stage: "build", status: "failed", buildError: true, wantCommands: []string{"build"}},
		{name: "launch failure", stage: "launch", status: "failed", launchError: true, wantCommands: []string{"build", "up"}},
		{name: "unhealthy", stage: "health", status: "failed", postLaunchHealth: "unhealthy", wantCommands: []string{"build", "up"}},
		{name: "healthy container using old image", stage: "health", status: "failed", postLaunchHealth: "healthy", forceOldImage: true, wantCommands: []string{"build", "up"}},
		{name: "no configured health check", stage: "health", status: "succeeded", wantCommands: []string{"build", "up"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			root := dockerTestRepo(t, "compose.yaml")
			fake := &dockerTestCLI{owner: root, buildError: tc.buildError, launchError: tc.launchError, postLaunchHealth: tc.postLaunchHealth, forceOldImage: tc.forceOldImage}
			manager := fake.manager(t)
			result := dockerTestOperation(t, manager, root, "update", "")
			if result.Stage != tc.stage || result.Status != tc.status || !slices.Equal(fake.mutations, tc.wantCommands) {
				t.Fatalf("operation = %#v; executed: %v", result, fake.mutations)
			}
			if !strings.Contains(result.Output, "构建输出") || (result.Status == "failed" && result.Error == "") {
				t.Fatalf("missing real output/error: %#v", result)
			}
		})
	}
}

func TestDockerUpdatePullsOnlyMissingNonBuildableImages(t *testing.T) {
	root := dockerTestRepo(t, "compose.yaml")
	for _, tc := range []struct {
		policy string
		want   []string
	}{
		{"missing", []string{"build", "pull", "up"}},
		{"never", []string{"build"}},
	} {
		t.Run(tc.policy, func(t *testing.T) {
			config := fmt.Sprintf(`{"name":"h5log","services":{"h5-log":{"image":"h5-log:latest","build":{"context":"."}},"db":{"image":"postgres:latest","pull_policy":%q}}}`, tc.policy)
			fake := &dockerTestCLI{owner: root, config: config, missingImage: "postgres:latest", launchError: true}
			result := dockerTestOperation(t, fake.manager(t), root, "update", "")
			if result.Stage != "launch" || !slices.Equal(fake.mutations, tc.want) {
				t.Fatalf("operation = %#v; executed: %v", result, fake.mutations)
			}
			if tc.policy == "missing" && !strings.Contains(result.Error, "port already allocated") {
				t.Fatalf("dependency pull did not reach launch: %#v", result)
			}
			if tc.policy == "never" && !strings.Contains(result.Error, "不允许拉取") {
				t.Fatalf("missing non-pullable image not reported: %#v", result)
			}
		})
	}
}

func TestDockerProjectNeverMutatesForeignOrUnownedComposeProject(t *testing.T) {
	root := dockerTestRepo(t, "compose.yaml")
	for _, fake := range []*dockerTestCLI{
		{owner: t.TempDir(), withContainer: true},
		{unownedVolume: true},
	} {
		manager := fake.manager(t)
		result := dockerTestOperation(t, manager, root, "update", "")
		if result.Status != "failed" || result.Stage != "prepare" || !strings.Contains(result.Error, "归属") && !strings.Contains(result.Error, "不属于") || len(fake.mutations) != 0 {
			t.Fatalf("operation = %#v; executed: %v", result, fake.mutations)
		}
	}
}

func TestDockerProjectStartsAndStopsExistingContainerWithoutBuilding(t *testing.T) {
	root := dockerTestRepo(t, "compose.yaml")
	fake := &dockerTestCLI{owner: root, withContainer: true}
	manager := fake.manager(t)
	for _, action := range []string{"start", "stop", "restart", "build"} {
		result := dockerTestOperation(t, manager, root, action, "h5-log")
		if result.Status != "succeeded" {
			t.Fatalf("%s = %#v", action, result)
		}
	}
	if !slices.Equal(fake.mutations, []string{"start", "stop", "restart", "build"}) {
		t.Fatalf("unexpected execution: %v", fake.mutations)
	}
}

func TestDockerfileOnlyBuildsRepoScopedImage(t *testing.T) {
	root := dockerTestRepo(t, "Dockerfile")
	fake := &dockerTestCLI{}
	manager := fake.manager(t)
	project, err := manager.Inspect(repoIDForPath(root), root)
	if err != nil || project.Image == nil || project.Files.Compose != "" || project.Error != "" {
		t.Fatalf("inspect = %#v, %v", project, err)
	}
	if result := dockerTestOperation(t, manager, root, "update", ""); result.Status != "failed" {
		t.Fatalf("Dockerfile-only update = %#v", result)
	}
	if result := dockerTestOperation(t, manager, root, "build", ""); result.Status != "succeeded" {
		t.Fatalf("Dockerfile-only build = %#v", result)
	}
	if fake.builtImage != project.Image.Name || !slices.Equal(fake.mutations, []string{"standalone build"}) {
		t.Fatalf("unexpected execution: %v, %q", fake.mutations, fake.builtImage)
	}
}

func TestDockerOperationStaysWithStartingRepoAndRejectsConcurrentChange(t *testing.T) {
	root, other := dockerTestRepo(t, "Dockerfile"), dockerTestRepo(t, "Dockerfile")
	manager := (&dockerTestCLI{}).manager(t)
	started := make(chan struct{})
	original := manager.run
	manager.run = func(ctx context.Context, root string, out, stderr io.Writer, args ...string) error {
		if len(args) > 2 && args[2] == "build" {
			close(started)
			<-ctx.Done()
			return ctx.Err()
		}
		return original(ctx, root, out, stderr, args...)
	}
	if _, err := manager.Start(repoIDForPath(root), root, "build", ""); err != nil {
		t.Fatal(err)
	}
	select {
	case <-started:
	case <-time.After(3 * time.Second):
		t.Fatal("operation never reached the CLI")
	}
	if op := manager.Operation(repoIDForPath(other), true); op != nil {
		t.Fatalf("different repo sees operation: %#v", op)
	}
	if _, err := manager.Start(repoIDForPath(other), other, "build", ""); err == nil {
		t.Fatal("concurrent engine mutation was accepted")
	}
	manager.Close()
	if op := manager.Operation(repoIDForPath(root), false); op.Status != "failed" || op.Error == "" {
		t.Fatalf("canceled operation = %#v", op)
	}
}

func dockerTestRepo(t *testing.T, names ...string) string {
	t.Helper()
	root := normalizePath(filepath.Join(t.TempDir(), "h5Log"))
	if err := os.MkdirAll(filepath.Join(root, ".git"), 0700); err != nil {
		t.Fatal(err)
	}
	for _, name := range names {
		if err := os.WriteFile(filepath.Join(root, name), nil, 0600); err != nil {
			t.Fatal(err)
		}
	}
	return root
}

func dockerTestOperation(t *testing.T, manager *DockerProjects, root, action, service string) *DockerOperation {
	t.Helper()
	id := repoIDForPath(root)
	if _, err := manager.Start(id, root, action, service); err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		if result := manager.Operation(id, true); result != nil && result.Status != "running" {
			return result
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatalf("operation stuck: %#v", manager.Operation(id, true))
	return nil
}

type dockerTestCLI struct {
	endpoint, owner, postLaunchHealth, builtImage                        string
	config, missingImage                                                 string
	engineError, composeMissing, withContainer, unownedVolume            bool
	buildError, launchError, launched, configUsedOverride, forceOldImage bool
	indexImage                                                           bool
	engineCalls                                                          int
	mutations                                                            []string
}

func (f *dockerTestCLI) manager(t *testing.T) *DockerProjects {
	t.Helper()
	manager := NewDockerProjects()
	manager.getEnv = func(string) string { return "" }
	manager.run = f.command
	t.Cleanup(manager.Close)
	return manager
}

func (f *dockerTestCLI) command(_ context.Context, _ string, out, stderr io.Writer, args ...string) error {
	output := func(value string) error { _, err := io.WriteString(out, value); return err }
	fail := func(value string) error { _, _ = io.WriteString(stderr, value); return errors.New("exit status 1") }
	if args[0] == "context" {
		if args[1] == "show" {
			return output("desktop-linux\n")
		}
		if f.endpoint != "" {
			return output(f.endpoint + "\n")
		}
		return output("npipe:////./pipe/dockerDesktopLinuxEngine\n")
	}
	if !slices.Equal(args[:2], []string{"--host", "npipe:////./pipe/dockerDesktopLinuxEngine"}) {
		return fmt.Errorf("unexpected docker address: %v", args)
	}
	args = args[2:]
	switch args[0] {
	case "version":
		f.engineCalls++
		if f.engineError {
			return fail("engine unavailable")
		}
		if f.indexImage {
			return output("29.9.3 1.56 1.56\n")
		}
		return output("27.5.0 1.47 1.47\n")
	case "image":
		if args[len(args)-1] == f.missingImage {
			return fail("No such image: " + f.missingImage)
		}
		if f.indexImage {
			if slices.Contains(args, "--platform") {
				if args[len(args)-1] != "sha256:index" || args[slices.Index(args, "--platform")+1] != "linux/amd64" {
					return fmt.Errorf("expected pinned index and container platform: %v", args)
				}
				return output("sha256:manifest\n")
			}
			return output("sha256:index\n")
		}
		return output("sha256:new\n")
	case "volume", "network":
		if f.unownedVolume && args[0] == "volume" {
			return output("other-data\n")
		}
		return nil
	case "container":
		if args[1] == "ls" {
			if f.withContainer || f.launched {
				return output("container-id\n")
			}
			return nil
		}
		image, health := "sha256:old", "healthy"
		if f.launched {
			health = f.postLaunchHealth
			if !f.forceOldImage {
				image = "sha256:new"
			}
		}
		ports := map[string]any{"3000/tcp": []map[string]string{{"HostIp": "127.0.0.1", "HostPort": "3685"}}}
		if f.indexImage {
			image = "sha256:config"
		}
		fields := []any{"/h5-log", image, "running", health, ports, f.owner, "h5-log", "False"}
		template := args[slices.Index(args, "--format")+1]
		if strings.Contains(template, "ImageManifestDescriptor") {
			if !f.indexImage {
				return fail("legacy client has no ImageManifestDescriptor")
			}
			digest := "sha256:manifest"
			if f.forceOldImage {
				digest = "sha256:older-manifest"
			}
			fields = append(fields, map[string]any{"digest": digest, "platform": map[string]string{"os": "linux", "architecture": "amd64"}})
		}
		row, _ := json.Marshal(fields)
		return output(string(row) + "\n")
	case "build":
		f.mutations = append(f.mutations, "standalone build")
		f.builtImage = args[slices.Index(args, "--tag")+1]
		return output("构建输出\n")
	case "compose":
		if args[1] == "version" {
			if f.composeMissing {
				return fail("compose unavailable")
			}
			return output("5.7.0\n")
		}
		if slices.Contains(args, "config") {
			f.configUsedOverride = slices.ContainsFunc(args, func(arg string) bool { return filepath.Base(arg) == "compose.override.yml" })
			if f.config != "" {
				return output(f.config)
			}
			return output(`{"name":"h5log","services":{"h5-log":{"image":"h5-log:latest","build":{"context":"."}}}}`)
		}
		index := slices.Index(args, "--project-name")
		if index == -1 || args[index+1] != "h5log" {
			return fmt.Errorf("Docker project name not pinned: %v", args)
		}
		action := args[index+2]
		if action == "logs" {
			return output("h5-log | ready\n")
		}
		f.mutations = append(f.mutations, action)
		switch action {
		case "build":
			if f.buildError {
				_, _ = io.WriteString(out, "构建输出\n")
				return fail("build failed")
			}
			return output("构建输出\n")
		case "pull":
			if !slices.Equal(args[index+3:], []string{"--ignore-buildable", "--policy", "missing", "--", "db"}) {
				return fmt.Errorf("unexpected pull scope: %v", args)
			}
			return nil
		case "up":
			if !slices.Equal(args[index+3:], []string{"--detach", "--no-build", "--pull", "never"}) {
				return fmt.Errorf("unexpected up flags: %v", args)
			}
			if f.launchError {
				return fail("port already allocated")
			}
			f.launched = true
			if f.owner == "" {
				// 新容器归属于启动仓库，测试使用准备阶段传入的 Compose 工作目录。
				f.owner = args[slices.Index(args, "--project-directory")+1]
			}
			return nil
		case "start", "stop", "restart":
			if args[len(args)-1] == "h5-log" {
				return nil
			}
		}
	}
	return fmt.Errorf("unexpected Docker invocation: %v", args)
}
