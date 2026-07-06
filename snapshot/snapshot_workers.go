package snapshot

import (
	"sync"
	"time"
)

const defaultSnapshotConcurrency = 5

func buildSnapshots(entries []repoEntry, scanTime time.Time, concurrency int, refreshRemotes bool) []repoSnapshot {
	workers := normalizeSnapshotConcurrency(concurrency, len(entries))
	if workers <= 1 {
		return buildSnapshotsSequential(entries, scanTime, refreshRemotes)
	}
	return buildSnapshotsParallel(entries, scanTime, workers, refreshRemotes)
}

func buildSnapshotsSequential(entries []repoEntry, scanTime time.Time, refreshRemotes bool) []repoSnapshot {
	snapshots := make([]repoSnapshot, 0, len(entries))
	for _, entry := range entries {
		snapshot, err := buildRepoSnapshotWithRemoteMode(entry, scanTime, refreshRemotes)
		if err != nil {
			continue
		}
		snapshots = append(snapshots, snapshot)
	}
	return snapshots
}

func buildSnapshotsParallel(entries []repoEntry, scanTime time.Time, workers int, refreshRemotes bool) []repoSnapshot {
	jobs := make(chan repoEntry)
	results := make(chan repoSnapshot, len(entries))
	var wg sync.WaitGroup

	wg.Add(workers)
	for i := 0; i < workers; i++ {
		go snapshotWorker(jobs, results, scanTime, refreshRemotes, &wg)
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

func snapshotWorker(jobs <-chan repoEntry, results chan<- repoSnapshot, scanTime time.Time, refreshRemotes bool, wg *sync.WaitGroup) {
	defer wg.Done()
	for entry := range jobs {
		snapshot, err := buildRepoSnapshotWithRemoteMode(entry, scanTime, refreshRemotes)
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
