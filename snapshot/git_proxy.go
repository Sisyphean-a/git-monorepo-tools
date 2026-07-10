package snapshot

import (
	"fmt"
	"os"
	"strings"
	"time"
)

const (
	defaultGitProxyHost = "127.0.0.1"
	defaultGitProxyPort = 7897
	defaultGitTimeout   = 60 * time.Second
)

type gitExecutor struct {
	proxy   GitProxySettings
	timeout time.Duration
}

func newGitExecutor(request Request) gitExecutor {
	return gitExecutor{
		proxy:   normalizedGitProxy(request.Proxy),
		timeout: normalizedGitTimeout(request.TimeoutSeconds),
	}
}

func defaultGitExecutor() gitExecutor {
	return newGitExecutor(Request{})
}

func buildGitProcessEnv(proxy GitProxySettings) []string {
	env := os.Environ()
	if !proxy.Enabled {
		return env
	}

	proxyURL := fmt.Sprintf("http://%s:%d", proxy.Host, proxy.Port)
	return append(withoutProxyEnv(env),
		"HTTP_PROXY="+proxyURL,
		"HTTPS_PROXY="+proxyURL,
		"ALL_PROXY="+proxyURL,
		"http_proxy="+proxyURL,
		"https_proxy="+proxyURL,
		"all_proxy="+proxyURL,
	)
}

func normalizedGitProxy(proxy GitProxySettings) GitProxySettings {
	host := strings.TrimSpace(proxy.Host)
	if host == "" {
		host = defaultGitProxyHost
	}
	port := proxy.Port
	if port < 1 || port > 65535 {
		port = defaultGitProxyPort
	}
	return GitProxySettings{Enabled: proxy.Enabled, Host: host, Port: port}
}

func normalizedGitTimeout(seconds int) time.Duration {
	if seconds <= 0 {
		return defaultGitTimeout
	}
	return time.Duration(seconds) * time.Second
}

func withoutProxyEnv(env []string) []string {
	filtered := make([]string, 0, len(env))
	for _, item := range env {
		key, _, _ := strings.Cut(item, "=")
		switch strings.ToUpper(key) {
		case "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY":
			continue
		default:
			filtered = append(filtered, item)
		}
	}
	return filtered
}
