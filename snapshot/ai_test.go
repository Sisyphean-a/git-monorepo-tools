package snapshot

import (
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestEnsureAISettingsDoesNotRequirePromptTemplate(t *testing.T) {
	settings := AICommitSettings{
		APIKey:       "sk-test",
		BaseURL:      "https://api.deepseek.com",
		Model:        "deepseek-chat",
		MaxDiffChars: 8000,
		StagedOnly:   true,
	}

	if err := ensureAISettings(settings); err != nil {
		t.Fatalf("expected settings to pass without prompt template, got %v", err)
	}
}

func TestExtractCommitMessageFromJSONObject(t *testing.T) {
	message, err := extractCommitMessage(`{"message":"feat: 修复 AI 提交覆盖"}`)
	if err != nil {
		t.Fatalf("expected JSON payload to parse, got %v", err)
	}
	if message != "feat: 修复 AI 提交覆盖" {
		t.Fatalf("unexpected message %q", message)
	}
}

func TestExtractCommitMessageFromFencedPayload(t *testing.T) {
	raw := "```json\n{\"message\":\"fix: 保留首轮生成的提交信息\"}\n```"
	message, err := extractCommitMessage(raw)
	if err != nil {
		t.Fatalf("expected fenced payload to parse, got %v", err)
	}
	if message != "fix: 保留首轮生成的提交信息" {
		t.Fatalf("unexpected message %q", message)
	}
}

func TestExtractCommitMessageFallsBackToSingleLine(t *testing.T) {
	message, err := extractCommitMessage("chore: 统一 AI 提交生成逻辑")
	if err != nil {
		t.Fatalf("expected single line payload to parse, got %v", err)
	}
	if message != "chore: 统一 AI 提交生成逻辑" {
		t.Fatalf("unexpected message %q", message)
	}
}

func TestBuildAIRequestPayloadAddsDeepSeekOnlyFields(t *testing.T) {
	deepSeekPayload := buildAIRequestPayload(AICommitSettings{
		BaseURL: "https://api.deepseek.com",
		Model:   "deepseek-chat",
	}, "diff")
	if _, ok := deepSeekPayload["response_format"]; !ok {
		t.Fatal("expected deepseek payload to include response_format")
	}
	if _, ok := deepSeekPayload["thinking"]; !ok {
		t.Fatal("expected deepseek payload to include thinking")
	}

	openAIPayload := buildAIRequestPayload(AICommitSettings{
		BaseURL: "https://api.openai.com/v1",
		Model:   "gpt-4o",
	}, "diff")
	if _, ok := openAIPayload["response_format"]; ok {
		t.Fatal("expected non-deepseek payload to omit response_format")
	}
	if _, ok := openAIPayload["thinking"]; ok {
		t.Fatal("expected non-deepseek payload to omit thinking")
	}
}

func TestUniquePathsBoundsAIFileList(t *testing.T) {
	files := make([]FileChange, 0, 2000)
	for index := 0; index < 2000; index++ {
		files = append(files, FileChange{Path: filepath.Join("src", fmt.Sprintf("file-%04d.ts", index))})
	}

	paths, pathCount := uniquePaths(files)
	if pathCount != len(files) {
		t.Fatalf("expected %d unique files, got %d", len(files), pathCount)
	}
	if len(paths) >= len(files) || paths[len(paths)-1] != "...[文件列表已截断]" {
		t.Fatalf("expected bounded path list with marker, got %d paths", len(paths))
	}
}

func TestSafeReadLinesBoundsLargePreviewLines(t *testing.T) {
	filePath := filepath.Join(t.TempDir(), "large.txt")
	content := strings.Repeat("中", maxAIPreviewLineBytes*4) + "\nsecond\n"
	if err := os.WriteFile(filePath, []byte(content), 0o644); err != nil {
		t.Fatalf("write test file: %v", err)
	}

	lines := safeReadLines(filePath)
	if len(lines) != 3 {
		t.Fatalf("expected final empty split segment, got %d lines", len(lines))
	}
	if len(lines[0]) > maxAIPreviewLineBytes+len("…[单行已截断]") {
		t.Fatalf("expected first line to stay bounded, got %d chars", len(lines[0]))
	}
	if lines[1] != "second" || lines[2] != "" {
		t.Fatalf("unexpected preview lines %#v", lines)
	}
}

func TestParseAIResponseRejectsOversizedResponse(t *testing.T) {
	response := &http.Response{
		StatusCode: http.StatusOK,
		Body:       io.NopCloser(strings.NewReader(strings.Repeat("x", maxAIResponseBytes+1))),
	}

	_, err := parseAIResponse(response)
	if err == nil || !strings.Contains(err.Error(), "响应超过") {
		t.Fatalf("expected oversized response error, got %v", err)
	}
}

func TestRequestAICompletionHonorsClientTimeout(t *testing.T) {
	originalClient := aiHTTPClient
	aiHTTPClient = &http.Client{Timeout: 50 * time.Millisecond}
	defer func() { aiHTTPClient = originalClient }()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(2 * time.Second)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	_, err := requestAICompletion(AICommitSettings{APIKey: "sk-test", BaseURL: server.URL, Model: "deepseek-chat"}, "prompt")
	if err == nil {
		t.Fatal("expected timeout error")
	}
	if !strings.Contains(err.Error(), "Client.Timeout") {
		t.Fatalf("expected client timeout error, got %v", err)
	}
}
