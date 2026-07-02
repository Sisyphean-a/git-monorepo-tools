package snapshot

import "testing"

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
