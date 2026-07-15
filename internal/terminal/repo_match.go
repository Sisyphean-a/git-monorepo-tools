package terminal

import (
	"os"
	"path/filepath"
)

func sameTerminalRepo(leftPath string, leftInfo os.FileInfo, rightPath string, rightInfo os.FileInfo) bool {
	if leftInfo != nil && rightInfo != nil && os.SameFile(leftInfo, rightInfo) {
		return true
	}
	return filepath.Clean(leftPath) == filepath.Clean(rightPath)
}
