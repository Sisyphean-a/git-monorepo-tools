package snapshot

import (
	"os"
	"sync"
	"time"
)

const ReadResourceCleanupInterval = 5 * time.Minute

// Rule: 仅缓存文件元数据和行数，不持有文件句柄或正文；失焦、周期清理和关闭都能断开缓存引用。
type untrackedStatsCache struct {
	mu           sync.Mutex
	repos        map[string]*repoUntrackedStats
	activeRepoID string
	closed       bool
	readLines    func(string) (int, os.FileInfo, error)
}

type repoUntrackedStats struct {
	mu    sync.Mutex
	files map[string]untrackedFileStats
}

type untrackedFileStats struct {
	size     int64
	modified time.Time
	mode     os.FileMode
	lines    int
	cachedAt time.Time
}

func (cache *untrackedStatsCache) repo(repoID string) *repoUntrackedStats {
	if cache == nil {
		return nil
	}
	cache.mu.Lock()
	defer cache.mu.Unlock()
	if cache.closed || cache.activeRepoID == "" {
		return nil
	}
	if cache.repos == nil {
		cache.repos = make(map[string]*repoUntrackedStats)
	}
	if cache.repos[repoID] == nil {
		cache.repos[repoID] = &repoUntrackedStats{}
	}
	return cache.repos[repoID]
}

func (cache *untrackedStatsCache) readFile(filePath string) (int, os.FileInfo, error) {
	if cache != nil && cache.readLines != nil {
		return cache.readLines(filePath)
	}
	return readFileLineCount(filePath)
}

func (cache *untrackedStatsCache) setActivity(repoID string) {
	cache.mu.Lock()
	defer cache.mu.Unlock()
	if cache.closed {
		return
	}
	if cache.activeRepoID != repoID {
		delete(cache.repos, cache.activeRepoID)
	}
	cache.activeRepoID = repoID
	if repoID == "" {
		cache.repos = nil
	}
}

func (cache *untrackedStatsCache) clear(closeCache bool) {
	cache.mu.Lock()
	defer cache.mu.Unlock()
	// Guarantee: 正在读取的请求只持有脱离全局缓存的旧容器，完成后不会重新挂回已清理的数据。
	cache.repos = nil
	cache.closed = cache.closed || closeCache
}

func (stats untrackedFileStats) matches(info os.FileInfo, now time.Time) bool {
	return info != nil && info.Mode().IsRegular() && stats.size == info.Size() &&
		stats.modified.Equal(info.ModTime()) && stats.mode == info.Mode() &&
		now.Sub(stats.cachedAt) < ReadResourceCleanupInterval
}

func (s *Service) gitExecutor(request Request) gitExecutor {
	executor := newGitExecutor(request)
	executor.fileStats = &s.fileStats
	return executor
}

func (s *Service) SetReadActivity(repoID string, fileBrowserActive bool) {
	s.fileStats.setActivity(repoID)
	s.repoFiles.setActivity(repoID, fileBrowserActive)
}

func (s *Service) CleanupReadResources() {
	s.fileStats.clear(false)
	s.repoFiles.close()
}

func (s *Service) Close() error {
	s.fileStats.clear(true)
	s.repoFiles.shutdown()
	return s.commands.close()
}
