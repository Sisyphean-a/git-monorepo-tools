package snapshot

import (
	"path/filepath"
	"sync"
	"time"
)

type batchRepoState struct {
	entry  repoEntry
	detail RepoDetail
}

func (s *Service) buildBatchStates(request Request) ([]batchRepoState, error) {
	entries := s.discoverRepos(s.buildRoots(request))
	executor := newGitExecutor(request)
	states := executor.buildBatchStates(entries, request.Concurrency, time.Now())
	return s.sortBatchStates(states), nil
}

func (executor gitExecutor) buildBatchStates(entries []repoEntry, concurrency int, scanTime time.Time) []batchRepoState {
	return runBatchStateWorkers(entries, normalizeSnapshotConcurrency(concurrency, len(entries)), func(entry repoEntry) batchRepoState {
		return executor.buildBatchState(entry, scanTime)
	})
}

func (executor gitExecutor) buildBatchState(entry repoEntry, scanTime time.Time) batchRepoState {
	repoPath := normalizePath(entry.repoPath)
	parsed, err := executor.readStatus(repoPath)
	scanError := ""
	if err != nil {
		scanError = err.Error()
	}
	repo := Repo{
		ID:        createRepoID(filepathBase(repoPath), repoPath),
		Name:      filepathBase(repoPath),
		Branch:    parsed.branch,
		Path:      repoPath,
		Remote:    parsed.remote,
		Category:  entry.category,
		Modified:  len(parsed.entries),
		Ahead:     parsed.ahead,
		Behind:    parsed.behind,
		Conflicts: parsed.conflicts,
		Status:    repoStatus(scanError, parsed.conflicts, len(parsed.entries)),
		ScanError: scanError,
		LastScan:  formatTime(scanTime),
	}
	return batchRepoState{entry: entry, detail: RepoDetail{Repo: repo}}
}

func (executor gitExecutor) buildBatchUpdates(states []batchRepoState, results []PullResult) []RepoSnapshotUpdate {
	updates := make([]RepoSnapshotUpdate, 0, len(results))
	for index, result := range results {
		if result.Result != "pulled" && result.Result != "pushed" {
			continue
		}
		update, err := executor.buildRepoUpdate(result.ID, states[index].entry.repoPath, states[index].entry.category, false)
		if err != nil {
			results[index] = PullResult{ID: result.ID, Name: result.Name, Path: result.Path, Result: "failed", Detail: "操作已完成，但状态回读失败：" + err.Error()}
			continue
		}
		updates = append(updates, update)
	}
	return updates
}

func runBatchStateWorkers(entries []repoEntry, workers int, build func(repoEntry) batchRepoState) []batchRepoState {
	if workers <= 1 {
		states := make([]batchRepoState, 0, len(entries))
		for _, entry := range entries {
			states = append(states, build(entry))
		}
		return states
	}
	states := make([]batchRepoState, len(entries))
	runBounded(entries, workers, func(index int, entry repoEntry) {
		states[index] = build(entry)
	})
	return states
}

func runBatchConcurrent(states []batchRepoState, concurrency int, run func(batchRepoState) PullResult) []PullResult {
	results := make([]PullResult, len(states))
	runBounded(states, normalizeSnapshotConcurrency(concurrency, len(states)), func(index int, state batchRepoState) {
		results[index] = run(state)
	})
	return results
}

func runBounded[T any](items []T, workers int, run func(int, T)) {
	if workers <= 1 {
		for index, item := range items {
			run(index, item)
		}
		return
	}
	jobs := make(chan int)
	var group sync.WaitGroup
	group.Add(workers)
	for worker := 0; worker < workers; worker++ {
		go func() {
			defer group.Done()
			for index := range jobs {
				run(index, items[index])
			}
		}()
	}
	for index := range items {
		jobs <- index
	}
	close(jobs)
	group.Wait()
}

func filepathBase(path string) string {
	return filepath.Base(path)
}
