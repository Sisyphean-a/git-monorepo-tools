package snapshot

import (
	"bytes"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"slices"
	"strings"
	"unicode/utf8"
)

const maxRepoFilePreviewBytes = 1024 * 1024

func (s *Service) ListRepoDirectory(repoID string, request Request, relativePath string) ([]RepoTreeEntry, error) {
	entry, err := s.resolveRepoEntry(repoID, request)
	if err != nil {
		return nil, err
	}
	directoryPath, normalizedPath, err := resolveRepoFilePath(entry.repoPath, relativePath)
	if err != nil {
		return nil, err
	}
	info, err := os.Stat(directoryPath)
	if err != nil {
		return nil, err
	}
	if !info.IsDir() {
		return nil, fmt.Errorf("不是目录：%s", displayRepoPath(normalizedPath))
	}

	directoryEntries, err := os.ReadDir(directoryPath)
	if err != nil {
		return nil, err
	}
	result := make([]RepoTreeEntry, 0, len(directoryEntries))
	for _, directoryEntry := range directoryEntries {
		if directoryEntry.Name() == ".git" {
			continue
		}
		isDir, include := repoTreeEntryKind(entry.repoPath, normalizedPath, directoryEntry)
		if !include {
			continue
		}
		result = append(result, RepoTreeEntry{
			Name:  directoryEntry.Name(),
			Path:  path.Join(normalizedPath, directoryEntry.Name()),
			IsDir: isDir,
		})
	}
	ignoredPaths, err := s.repoFiles.ignoredPaths(newGitExecutor(request), entry.repoPath, normalizedPath, result)
	if err != nil {
		return nil, fmt.Errorf("读取 Git 忽略规则失败：%w", err)
	}
	result = slices.DeleteFunc(result, func(entry RepoTreeEntry) bool {
		_, ignored := ignoredPaths[entry.Path]
		return ignored
	})
	slices.SortFunc(result, func(left, right RepoTreeEntry) int {
		if left.IsDir != right.IsDir {
			if left.IsDir {
				return -1
			}
			return 1
		}
		leftName := strings.ToLower(left.Name)
		rightName := strings.ToLower(right.Name)
		if order := strings.Compare(leftName, rightName); order != 0 {
			return order
		}
		return strings.Compare(left.Name, right.Name)
	})
	return result, nil
}

func (s *Service) ReadRepoFile(repoID string, request Request, relativePath string) (RepoFileContent, error) {
	entry, err := s.resolveRepoEntry(repoID, request)
	if err != nil {
		return RepoFileContent{}, err
	}
	filePath, normalizedPath, err := resolveRepoFilePath(entry.repoPath, relativePath)
	if err != nil {
		return RepoFileContent{}, err
	}
	file, err := os.Open(filePath)
	if err != nil {
		return RepoFileContent{}, err
	}
	defer file.Close()

	info, err := file.Stat()
	if err != nil {
		return RepoFileContent{}, err
	}
	if !info.Mode().IsRegular() {
		return RepoFileContent{}, fmt.Errorf("不是普通文件：%s", displayRepoPath(normalizedPath))
	}
	if info.Size() > maxRepoFilePreviewBytes {
		return RepoFileContent{}, fmt.Errorf("文件超过 1 MiB，未加载以避免占用过多内存：%s", displayRepoPath(normalizedPath))
	}
	content, err := io.ReadAll(io.LimitReader(file, maxRepoFilePreviewBytes+1))
	if err != nil {
		return RepoFileContent{}, err
	}
	if len(content) > maxRepoFilePreviewBytes {
		return RepoFileContent{}, fmt.Errorf("文件超过 1 MiB，未加载以避免占用过多内存：%s", displayRepoPath(normalizedPath))
	}
	if bytes.IndexByte(content, 0) >= 0 || !utf8.Valid(content) {
		return RepoFileContent{}, fmt.Errorf("二进制文件暂不支持预览：%s", displayRepoPath(normalizedPath))
	}
	return RepoFileContent{Path: normalizedPath, Content: string(content), Size: info.Size()}, nil
}

func repoTreeEntryKind(repoPath, parentPath string, entry os.DirEntry) (bool, bool) {
	if entry.Type()&os.ModeSymlink == 0 {
		if entry.IsDir() {
			return true, true
		}
		return false, entry.Type().IsRegular()
	}

	resolvedPath, _, err := resolveRepoFilePath(repoPath, path.Join(parentPath, entry.Name()))
	if err != nil {
		return false, false
	}
	info, err := os.Stat(resolvedPath)
	if err != nil {
		return false, false
	}
	return info.IsDir(), info.IsDir() || info.Mode().IsRegular()
}

func resolveRepoFilePath(repoPath, relativePath string) (string, string, error) {
	normalizedPath := strings.TrimPrefix(normalizePath(relativePath), "./")
	if normalizedPath == "." {
		normalizedPath = ""
	}
	localPath := filepath.FromSlash(normalizedPath)
	if filepath.IsAbs(localPath) {
		return "", "", fmt.Errorf("文件路径必须位于仓库内：%s", relativePath)
	}
	cleanPath := filepath.Clean(localPath)
	if cleanPath == "." {
		cleanPath = ""
	}
	if cleanPath == ".." || strings.HasPrefix(cleanPath, ".."+string(filepath.Separator)) {
		return "", "", fmt.Errorf("文件路径超出仓库范围：%s", relativePath)
	}

	resolvedRoot, err := filepath.EvalSymlinks(filepath.Clean(filepath.FromSlash(repoPath)))
	if err != nil {
		return "", "", err
	}
	resolvedPath, err := filepath.EvalSymlinks(filepath.Join(resolvedRoot, cleanPath))
	if err != nil {
		return "", "", err
	}
	containedPath, err := filepath.Rel(resolvedRoot, resolvedPath)
	if err != nil || containedPath == ".." || strings.HasPrefix(containedPath, ".."+string(filepath.Separator)) {
		return "", "", fmt.Errorf("文件路径超出仓库范围：%s", relativePath)
	}
	return resolvedPath, normalizePath(cleanPath), nil
}

func displayRepoPath(relativePath string) string {
	if relativePath == "" {
		return "."
	}
	return relativePath
}
