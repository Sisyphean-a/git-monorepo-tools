package snapshot

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

const (
	aiRequestTimeout            = 30 * time.Second
	maxAIResponseBytes          = 64 * 1024
	defaultAICommitSystemPrompt = `
You generate a single Git commit message from repository changes.

Requirements:
- Output JSON only: {"message":"..."}.
- The message must be Simplified Chinese.
- The message must be one line.
- Prefer Conventional Commits style: type(scope): summary.
- Keep it specific and concise.
- Do not mention AI, JSON, prompt, or file counts unless they are essential.
- If the changes span multiple areas, omit scope instead of guessing.
- If you cannot infer a precise type, use chore.
`
)

// aiHTTPClient 只提供客户端模板，单次请求的代理与连接池不共享。
var aiHTTPClient = &http.Client{Timeout: aiRequestTimeout}

func newAIHTTPClient(proxy AIProxySettings) (*http.Client, error) {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	// Rule: AI 显式直连或使用自己的 HTTP 代理，不读取 Git 设置或环境代理。
	transport.Proxy = nil
	if proxy.Enabled {
		host := strings.TrimSpace(proxy.Host)
		if host == "" || strings.ContainsAny(host, "/?#@ \t\r\n") || proxy.Port < 1 || proxy.Port > 65535 {
			return nil, errors.New("AI 服务代理配置无效：请填写不含协议的主机和 1–65535 的端口")
		}
		transport.Proxy = http.ProxyURL(&url.URL{Scheme: "http", Host: net.JoinHostPort(host, strconv.Itoa(proxy.Port))})
	}
	client := *aiHTTPClient
	client.Transport = transport
	return &client, nil
}

func requestAICompletion(settings AICommitSettings, prompt string) (string, error) {
	payload := buildAIRequestPayload(settings, prompt)
	body, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	request, err := newAIRequest(settings, body)
	if err != nil {
		return "", fmt.Errorf("AI 服务请求创建失败：%w", err)
	}
	client, err := newAIHTTPClient(settings.Proxy)
	if err != nil {
		return "", err
	}
	defer client.CloseIdleConnections()
	response, err := client.Do(request)
	if err != nil {
		return "", fmt.Errorf("AI 服务请求失败：%w", err)
	}
	defer response.Body.Close()
	return parseAIResponse(response)
}

func buildAIRequestPayload(settings AICommitSettings, prompt string) map[string]any {
	payload := map[string]any{
		"model": settings.Model,
		"messages": []map[string]string{
			{"role": "system", "content": strings.TrimSpace(defaultAICommitSystemPrompt)},
			{"role": "user", "content": prompt},
		},
	}
	if isDeepSeekProvider(settings) {
		payload["response_format"] = map[string]string{"type": "json_object"}
		payload["thinking"] = map[string]string{"type": "disabled"}
	}
	return payload
}

func isDeepSeekProvider(settings AICommitSettings) bool {
	provider := strings.ToLower(strings.TrimSpace(settings.BaseURL) + " " + strings.TrimSpace(settings.Model))
	return strings.Contains(provider, "deepseek")
}

func newAIRequest(settings AICommitSettings, body []byte) (*http.Request, error) {
	request, err := http.NewRequest(http.MethodPost, strings.TrimRight(settings.BaseURL, "/")+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Authorization", "Bearer "+settings.APIKey)
	return request, nil
}

func parseAIResponse(response *http.Response) (string, error) {
	rawBody, readErr := io.ReadAll(io.LimitReader(response.Body, maxAIResponseBytes+1))
	if len(rawBody) > maxAIResponseBytes {
		return "", fmt.Errorf("AI 响应超过 %d 字节限制", maxAIResponseBytes)
	}
	var payload map[string]any
	_ = json.Unmarshal(rawBody, &payload)
	text := strings.TrimSpace(string(rawBody))
	// Failure: 已收到的服务商错误优先展示，不能被随后读取超时覆盖；保留状态码和请求标识等原文。
	if response.StatusCode < 200 || response.StatusCode >= 300 || payload["error"] != nil {
		if text == "" {
			text = "空响应"
		}
		if readErr != nil {
			return "", fmt.Errorf("AI 服务返回错误（HTTP %d）：%s；响应读取失败：%w", response.StatusCode, text, readErr)
		}
		return "", fmt.Errorf("AI 服务返回错误（HTTP %d）：%s", response.StatusCode, text)
	}
	if readErr != nil {
		return "", fmt.Errorf("AI 服务响应读取失败（HTTP %d）：%w；已接收响应：%s", response.StatusCode, readErr, text)
	}
	content := nestedString(payload, "choices", "0", "message", "content")
	if strings.TrimSpace(content) == "" {
		return "", fmt.Errorf("AI 响应未返回提交信息（HTTP %d）：%s", response.StatusCode, text)
	}
	return content, nil
}

func nestedString(value any, path ...string) string {
	current := value
	for _, key := range path {
		switch typed := current.(type) {
		case map[string]any:
			current = typed[key]
		case []any:
			if key != "0" || len(typed) == 0 {
				return ""
			}
			current = typed[0]
		default:
			return ""
		}
	}
	result, _ := current.(string)
	return result
}

type generatedMessage struct {
	Message string `json:"message"`
}

func extractCommitMessage(content string) (string, error) {
	normalized := trimCodeFence(strings.TrimSpace(content))
	if normalized == "" {
		return "", errors.New("AI 返回了空的提交信息")
	}

	fullErr := errors.New("AI 返回的提交信息格式不合法")
	if message, err := decodeGeneratedMessage(normalized); err == nil {
		return message, nil
	} else {
		fullErr = err
	}
	if unquoted, err := strconv.Unquote(normalized); err == nil {
		if message, innerErr := decodeGeneratedMessage(strings.TrimSpace(unquoted)); innerErr == nil {
			return message, nil
		}
	}
	if object := firstJSONObject(normalized); object != "" && object != normalized {
		if message, err := decodeGeneratedMessage(object); err == nil {
			return message, nil
		}
	}
	if message := singleLineMessage(normalized); message != "" {
		return message, nil
	}
	return "", fullErr
}

func decodeGeneratedMessage(content string) (string, error) {
	var message generatedMessage
	if err := json.Unmarshal([]byte(content), &message); err != nil {
		return "", err
	}
	normalized := normalizeGeneratedMessage(message.Message)
	if normalized == "" {
		return "", errors.New("AI 返回了空的提交信息")
	}
	return normalized, nil
}

func trimCodeFence(content string) string {
	if !strings.HasPrefix(content, "```") {
		return content
	}
	lines := strings.Split(content, "\n")
	if len(lines) < 3 || !strings.HasPrefix(lines[0], "```") || strings.TrimSpace(lines[len(lines)-1]) != "```" {
		return content
	}
	return strings.TrimSpace(strings.Join(lines[1:len(lines)-1], "\n"))
}

func firstJSONObject(content string) string {
	start := -1
	depth := 0
	inString := false
	escaped := false
	for index := 0; index < len(content); index++ {
		char := content[index]
		if escaped {
			escaped = false
			continue
		}
		if char == '\\' && inString {
			escaped = true
			continue
		}
		if char == '"' {
			inString = !inString
			continue
		}
		if inString {
			continue
		}
		if char == '{' {
			if depth == 0 {
				start = index
			}
			depth++
			continue
		}
		if char != '}' || depth == 0 {
			continue
		}
		depth--
		if depth == 0 && start >= 0 {
			return content[start : index+1]
		}
	}
	return ""
}

func singleLineMessage(content string) string {
	trimmed := strings.TrimSpace(content)
	if trimmed == "" || strings.ContainsAny(trimmed, "\r\n") {
		return ""
	}
	if strings.HasPrefix(trimmed, "{") || strings.HasPrefix(trimmed, "[") {
		return ""
	}
	return normalizeGeneratedMessage(trimmed)
}

func normalizeGeneratedMessage(message string) string {
	return strings.Join(strings.Fields(strings.TrimSpace(message)), " ")
}
