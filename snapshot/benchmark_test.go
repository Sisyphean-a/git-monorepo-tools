package snapshot

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"
)

func BenchmarkBuildAppSnapshot(b *testing.B) {
	benchmarkBuildAppSnapshot(b, 0)
}

func BenchmarkBuildAppSnapshotConcurrency(b *testing.B) {
	for _, concurrency := range []int{1, 3, 5} {
		b.Run(fmt.Sprintf("concurrency_%d", concurrency), func(b *testing.B) {
			benchmarkBuildAppSnapshot(b, concurrency)
		})
	}
}

func benchmarkBuildAppSnapshot(b *testing.B, concurrency int) {
	service := benchmarkService(b)
	request := Request{Concurrency: concurrency}
	repoCount := 0

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		snapshot, err := service.BuildAppSnapshot(request)
		if err != nil {
			b.Fatal(err)
		}
		repoCount = len(snapshot.Repos)
		if repoCount == 0 {
			b.Fatal("expected scanned repositories")
		}
	}
	b.StopTimer()
	b.ReportMetric(float64(repoCount), "repos")
}

func benchmarkService(b *testing.B) *Service {
	b.Helper()
	cwd, err := os.Getwd()
	if err != nil {
		b.Fatal(err)
	}
	return NewService(filepath.Dir(cwd))
}
