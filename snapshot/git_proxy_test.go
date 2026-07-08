package snapshot

import "testing"

func TestBuildGitProcessEnvAppliesManualProxyOverride(t *testing.T) {
	previous := currentGitProxy()
	SetRuntimeGitProxy(GitProxySettings{Enabled: true, Host: "127.0.0.1", Port: 7897})
	t.Cleanup(func() {
		SetRuntimeGitProxy(previous)
	})
	t.Setenv("HTTPS_PROXY", "http://old-proxy:8888")

	env := buildGitProcessEnv()

	assertEnvContains(t, env, "HTTP_PROXY=http://127.0.0.1:7897")
	assertEnvContains(t, env, "HTTPS_PROXY=http://127.0.0.1:7897")
	assertEnvContains(t, env, "ALL_PROXY=http://127.0.0.1:7897")
	assertEnvMissing(t, env, "HTTPS_PROXY=http://old-proxy:8888")
}

func TestBuildGitProcessEnvKeepsParentProxyWhenManualProxyDisabled(t *testing.T) {
	previous := currentGitProxy()
	SetRuntimeGitProxy(GitProxySettings{})
	t.Cleanup(func() {
		SetRuntimeGitProxy(previous)
	})
	t.Setenv("HTTPS_PROXY", "http://parent-proxy:8888")

	env := buildGitProcessEnv()

	assertEnvContains(t, env, "HTTPS_PROXY=http://parent-proxy:8888")
}

func assertEnvContains(t *testing.T, env []string, expected string) {
	t.Helper()
	for _, item := range env {
		if item == expected {
			return
		}
	}
	t.Fatalf("expected env to contain %q, got %#v", expected, env)
}

func assertEnvMissing(t *testing.T, env []string, unexpected string) {
	t.Helper()
	for _, item := range env {
		if item == unexpected {
			t.Fatalf("expected env to exclude %q, got %#v", unexpected, env)
		}
	}
}
