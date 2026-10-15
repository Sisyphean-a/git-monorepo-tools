package snapshot

import (
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
)

func TestRequestAICompletionUsesOnlyItsOwnProxy(t *testing.T) {
	var directCalls, proxyCalls atomic.Int32
	origin := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		directCalls.Add(1)
		fmt.Fprint(w, `{"choices":[{"message":{"content":"fix: 直连"}}]}`)
	}))
	defer origin.Close()
	proxy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		proxyCalls.Add(1)
		if !r.URL.IsAbs() || r.URL.String() != origin.URL+"/chat/completions" || r.Header.Get("Authorization") != "Bearer test-key" {
			t.Errorf("unexpected proxied AI request: %s, %s", r.Method, r.URL)
		}
		fmt.Fprint(w, `{"choices":[{"message":{"content":"fix: 代理"}}]}`)
	}))
	defer proxy.Close()
	proxyURL, _ := url.Parse(proxy.URL)
	port, _ := strconv.Atoi(proxyURL.Port())
	settings := AICommitSettings{APIKey: "test-key", BaseURL: origin.URL, Model: "test", Proxy: AIProxySettings{Host: proxyURL.Hostname(), Port: port}}

	// Rule: 环境代理和 NO_PROXY 均不能覆盖用户对 AI 路由的明确选择。
	t.Setenv("HTTP_PROXY", "http://127.0.0.1:1")
	t.Setenv("HTTPS_PROXY", "http://127.0.0.1:1")
	t.Setenv("NO_PROXY", "*")
	for _, enabled := range []bool{false, true, false} {
		settings.Proxy.Enabled = enabled
		message, err := requestAICompletion(settings, "diff")
		want := "fix: 直连"
		if enabled {
			want = "fix: 代理"
		}
		if err != nil || message != want {
			t.Fatalf("proxy enabled=%t: got %q, %v", enabled, message, err)
		}
	}
	if directCalls.Load() != 2 || proxyCalls.Load() != 1 {
		t.Fatalf("unexpected routing: direct=%d proxy=%d", directCalls.Load(), proxyCalls.Load())
	}
}

func TestAIProxyFailureDoesNotFallBackToDirect(t *testing.T) {
	var directCalls atomic.Int32
	origin := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		directCalls.Add(1)
		fmt.Fprint(w, `{"choices":[{"message":{"content":"unexpected direct call"}}]}`)
	}))
	defer origin.Close()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	port := listener.Addr().(*net.TCPAddr).Port
	listener.Close()
	_, err = requestAICompletion(AICommitSettings{
		APIKey: "test-key", BaseURL: origin.URL, Model: "test",
		Proxy: AIProxySettings{Enabled: true, Host: "127.0.0.1", Port: port},
	}, "diff")
	if err == nil || !strings.Contains(err.Error(), "AI 服务请求失败") || directCalls.Load() != 0 {
		t.Fatalf("expected explicit proxy failure without direct request, got %v, direct=%d", err, directCalls.Load())
	}
}

func TestAIHTTPSUsesProxyTunnel(t *testing.T) {
	origin := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.TLS == nil || r.Header.Get("Authorization") != "Bearer test-key" {
			t.Error("expected authenticated AI request inside TLS")
		}
		fmt.Fprint(w, `{"choices":[{"message":{"content":"fix: HTTPS 代理"}}]}`)
	}))
	defer origin.Close()
	var tunnels atomic.Int32
	proxy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodConnect || r.Host != origin.Listener.Addr().String() || r.Header.Get("Authorization") != "" {
			t.Errorf("unexpected CONNECT request: %s %s", r.Method, r.Host)
			http.Error(w, "unexpected tunnel", http.StatusBadRequest)
			return
		}
		upstream, err := net.Dial("tcp", r.Host)
		if err != nil {
			t.Error(err)
			http.Error(w, "dial failed", http.StatusBadGateway)
			return
		}
		defer upstream.Close()
		downstream, _, err := w.(http.Hijacker).Hijack()
		if err != nil {
			t.Error(err)
			return
		}
		defer downstream.Close()
		tunnels.Add(1)
		fmt.Fprint(downstream, "HTTP/1.1 200 Connection Established\r\n\r\n")
		copied := make(chan struct{})
		go func() {
			io.Copy(upstream, downstream)
			upstream.Close()
			close(copied)
		}()
		io.Copy(downstream, upstream)
		downstream.Close()
		<-copied
	}))
	defer proxy.Close()
	proxyURL, _ := url.Parse(proxy.URL)
	port, _ := strconv.Atoi(proxyURL.Port())
	client, err := newAIHTTPClient(AIProxySettings{Enabled: true, Host: proxyURL.Hostname(), Port: port})
	if err != nil {
		t.Fatal(err)
	}
	defer client.CloseIdleConnections()
	// Rule: 仅测试信任本地证书，生产客户端继续使用系统信任与标准 TLS 校验。
	client.Transport.(*http.Transport).TLSClientConfig = origin.Client().Transport.(*http.Transport).TLSClientConfig.Clone()
	request, _ := newAIRequest(AICommitSettings{APIKey: "test-key", BaseURL: origin.URL}, []byte(`{}`))
	response, err := client.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	content, err := parseAIResponse(response)
	if err != nil || content != "fix: HTTPS 代理" || tunnels.Load() != 1 {
		t.Fatalf("unexpected tunneled completion: %q, %v, tunnels=%d", content, err, tunnels.Load())
	}
}

func TestAIProxyConfigurationIsExplicitForHTTPAndHTTPS(t *testing.T) {
	for _, enabled := range []bool{false, true} {
		client, err := newAIHTTPClient(AIProxySettings{Enabled: enabled, Host: "127.0.0.1", Port: 7897})
		if err != nil {
			t.Fatal(err)
		}
		defer client.CloseIdleConnections()
		transport := client.Transport.(*http.Transport)
		for _, scheme := range []string{"http", "https"} {
			request, _ := http.NewRequest(http.MethodPost, scheme+"://ai.example/chat/completions", nil)
			if !enabled {
				if transport.Proxy != nil {
					t.Fatal("disabled AI proxy must bypass environment proxies")
				}
				continue
			}
			proxy, err := transport.Proxy(request)
			if err != nil || proxy.String() != "http://127.0.0.1:7897" {
				t.Fatalf("unexpected %s proxy: %v, %v", scheme, proxy, err)
			}
		}
	}
	for _, proxy := range []AIProxySettings{
		{Enabled: true, Host: "", Port: 7897},
		{Enabled: true, Host: "http://127.0.0.1", Port: 7897},
		{Enabled: true, Host: "127.0.0.1", Port: 0},
		{Enabled: true, Host: "127.0.0.1", Port: 65536},
	} {
		if _, err := newAIHTTPClient(proxy); err == nil || !strings.Contains(err.Error(), "AI 服务代理配置") {
			t.Fatalf("expected explicit invalid proxy configuration error, got %v", err)
		}
	}
}
