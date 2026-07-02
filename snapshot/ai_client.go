package snapshot

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"
)

const defaultAICommitSystemPrompt = `
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

func requestAICompletion(settings AICommitSettings, prompt string) (string, error) {
	payload := buildAIRequestPayload(settings, prompt)
	body, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	request, err := newAIRequest(settings, body)
	if err != nil {
		return "", err
	}
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return "", err
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
	rawBody, err := io.ReadAll(response.Body)
	if err != nil {
		return "", err
	}
	var payload map[string]any
	_ = json.Unmarshal(rawBody, &payload)
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		if message := nestedString(payload, "error", "message"); message != "" {
			return "", errors.New(message)
		}
		text := strings.TrimSpace(string(rawBody))
		if text == "" {
			text = "AI 服务调用失败"
		}
		return "", errors.New(text)
	}
	content := nestedString(payload, "choices", "0", "message", "content")
	if strings.TrimSpace(content) == "" {
		return "", errors.New("AI 未返回提交信息")
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
