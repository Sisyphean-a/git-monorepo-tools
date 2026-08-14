//go:build windows

package desktop

import (
	"os"
	"path/filepath"
	"testing"
)

func TestValidateClipboardImageFileRejectsMissingFile(t *testing.T) {
	t.Parallel()

	imagePath := filepath.Join(t.TempDir(), "missing.png")
	if err := validateClipboardImageFile(imagePath); err == nil {
		t.Fatal("expected a detected image without an output file to fail")
	}
}

func TestValidateClipboardImageFileRejectsEmptyFile(t *testing.T) {
	t.Parallel()

	imagePath := filepath.Join(t.TempDir(), "empty.png")
	if err := os.WriteFile(imagePath, nil, 0o600); err != nil {
		t.Fatalf("create empty image file: %v", err)
	}
	if err := validateClipboardImageFile(imagePath); err == nil {
		t.Fatal("expected an empty image file to fail")
	}
}

func TestValidateClipboardImageFileAcceptsNonEmptyFile(t *testing.T) {
	t.Parallel()

	imagePath := filepath.Join(t.TempDir(), "image.png")
	if err := os.WriteFile(imagePath, []byte("png"), 0o600); err != nil {
		t.Fatalf("create image file: %v", err)
	}
	if err := validateClipboardImageFile(imagePath); err != nil {
		t.Fatalf("expected non-empty image file to pass validation: %v", err)
	}
}
