package snapshot

import "testing"

func TestBuildGitProcessEnvAppliesManualProxyOverride(t *testing.T) {
	t.Setenv("HTTPS_PROXY", "http://old-proxy:8888")

	env := buildGitProcessEnv(GitProxySettings{Enabled: true, Host: "127.0.0.1", Port: 7897})

	assertEnvContains(t, env, "HTTP_PROXY=http://127.0.0.1:7897")
	assertEnvContains(t, env, "HTTPS_PROXY=http://127.0.0.1:7897")
	assertEnvContains(t, env, "ALL_PROXY=http://127.0.0.1:7897")
	assertEnvMissing(t, env, "HTTPS_PROXY=http://old-proxy:8888")
}

func TestBuildGitProcessEnvKeepsParentProxyWhenManualProxyDisabled(t *testing.T) {
	t.Setenv("HTTPS_PROXY", "http://parent-proxy:8888")

	env := buildGitProcessEnv(GitProxySettings{})

	assertEnvContains(t, env, "HTTPS_PROXY=http://parent-proxy:8888")
}

func TestGitExecutorsKeepProxyAndTimeoutPerRequest(t *testing.T) {
	first := newGitExecutor(Request{
		Proxy:          GitProxySettings{Enabled: true, Host: "proxy-one", Port: 1080},
		TimeoutSeconds: 30,
	})
	second := newGitExecutor(Request{
		Proxy:          GitProxySettings{Enabled: true, Host: "proxy-two", Port: 2080},
		TimeoutSeconds: 120,
	})

	assertEnvContains(t, buildGitProcessEnv(first.proxy), "HTTPS_PROXY=http://proxy-one:1080")
	assertEnvContains(t, buildGitProcessEnv(second.proxy), "HTTPS_PROXY=http://proxy-two:2080")
	if first.timeout.Seconds() != 30 || second.timeout.Seconds() != 120 {
		t.Fatalf("expected request timeouts to stay isolated, got %s and %s", first.timeout, second.timeout)
	}
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
