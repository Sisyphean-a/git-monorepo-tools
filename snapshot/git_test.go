package snapshot

import (
	"errors"
	"testing"
	"time"
)

func TestRefreshRemoteWithRetryRetriesImmediatelyAndAfterDelay(t *testing.T) {
	originalFetch := runRemoteFetch
	originalSleep := sleepForRemoteFetchRetry
	originalDelays := remoteFetchRetryDelays
	t.Cleanup(func() {
		runRemoteFetch = originalFetch
		sleepForRemoteFetchRetry = originalSleep
		remoteFetchRetryDelays = originalDelays
	})

	attempts := 0
	sleeps := []time.Duration{}
	runRemoteFetch = func(repoPath, remote string) error {
		attempts++
		if attempts < 3 {
			return errors.New("handshake failed")
		}
		return nil
	}
	sleepForRemoteFetchRetry = func(delay time.Duration) {
		sleeps = append(sleeps, delay)
	}
	remoteFetchRetryDelays = []time.Duration{0, 0, 5 * time.Second}

	if err := refreshRemoteWithRetry("repo", "origin"); err != nil {
		t.Fatalf("expected retry to recover, got %v", err)
	}
	if attempts != 3 {
		t.Fatalf("expected 3 fetch attempts, got %d", attempts)
	}
	if len(sleeps) != 1 || sleeps[0] != 5*time.Second {
		t.Fatalf("expected one delayed retry after 5s, got %#v", sleeps)
	}
}

func TestRefreshRemoteWithRetryReturnsLastFailure(t *testing.T) {
	originalFetch := runRemoteFetch
	originalSleep := sleepForRemoteFetchRetry
	originalDelays := remoteFetchRetryDelays
	t.Cleanup(func() {
		runRemoteFetch = originalFetch
		sleepForRemoteFetchRetry = originalSleep
		remoteFetchRetryDelays = originalDelays
	})

	lastErr := errors.New("still failing")
	attempts := 0
	sleeps := []time.Duration{}
	runRemoteFetch = func(repoPath, remote string) error {
		attempts++
		return lastErr
	}
	sleepForRemoteFetchRetry = func(delay time.Duration) {
		sleeps = append(sleeps, delay)
	}
	remoteFetchRetryDelays = []time.Duration{0, 0, 5 * time.Second}

	err := refreshRemoteWithRetry("repo", "origin")
	if !errors.Is(err, lastErr) {
		t.Fatalf("expected last fetch error, got %v", err)
	}
	if attempts != 3 {
		t.Fatalf("expected 3 fetch attempts, got %d", attempts)
	}
	if len(sleeps) != 1 || sleeps[0] != 5*time.Second {
		t.Fatalf("expected one delayed retry after 5s, got %#v", sleeps)
	}
}
