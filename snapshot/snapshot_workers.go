package snapshot

import (
	"sync"
	"time"
)

const defaultSnapshotConcurrency = 5

type snapshotBuildOptions struct {
	scanTime       time.Time
	concurrency    int
	refreshRemotes bool
}

func (executor gitExecutor) buildSnapshots(entries []repoEntry, options snapshotBuildOptions) []repoSnapshot {
	workers := normalizeSnapshotConcurrency(options.concurrency, len(entries))
	if workers <= 1 {
		return executor.buildSnapshotsSequential(entries, options)
	}
	return executor.buildSnapshotsParallel(entries, options, workers)
}

func (executor gitExecutor) buildSnapshotsSequential(entries []repoEntry, options snapshotBuildOptions) []repoSnapshot {
	snapshots := make([]repoSnapshot, 0, len(entries))
	for _, entry := range entries {
		snapshot, err := executor.buildRepoSnapshotWithRemoteMode(entry, options.scanTime, options.refreshRemotes)
		if err != nil {
			continue
		}
		snapshots = append(snapshots, snapshot)
	}
	return snapshots
}

func (executor gitExecutor) buildSnapshotsParallel(entries []repoEntry, options snapshotBuildOptions, workers int) []repoSnapshot {
	jobs := make(chan repoEntry)
	results := make(chan repoSnapshot, len(entries))
	var wg sync.WaitGroup

	wg.Add(workers)
	for i := 0; i < workers; i++ {
		go executor.snapshotWorker(jobs, results, options, &wg)
	}
	go func() {
		for _, entry := range entries {
			jobs <- entry
		}
		close(jobs)
		wg.Wait()
		close(results)
	}()

	snapshots := make([]repoSnapshot, 0, len(entries))
	for snapshot := range results {
		snapshots = append(snapshots, snapshot)
	}
	return snapshots
}

func (executor gitExecutor) snapshotWorker(jobs <-chan repoEntry, results chan<- repoSnapshot, options snapshotBuildOptions, wg *sync.WaitGroup) {
	defer wg.Done()
	for entry := range jobs {
		snapshot, err := executor.buildRepoSnapshotWithRemoteMode(entry, options.scanTime, options.refreshRemotes)
		if err == nil {
			results <- snapshot
		}
	}
}

func normalizeSnapshotConcurrency(concurrency, repoCount int) int {
	if repoCount == 0 {
		return 0
	}
	if concurrency <= 0 {
		concurrency = defaultSnapshotConcurrency
	}
	if concurrency > repoCount {
		return repoCount
	}
	return concurrency
}
