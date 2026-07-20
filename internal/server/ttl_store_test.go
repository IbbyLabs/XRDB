package server

import (
	"sync"
	"testing"
	"time"
)

func TestTTLStoreConcurrentAccess(t *testing.T) {
	s := newTTLStore(map[string]time.Duration{"tmdb": time.Hour})
	var wg sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg.Add(2)
		go func(i int) { defer wg.Done(); s.set("tmdb", time.Duration(i)*time.Minute) }(i)
		go func() { defer wg.Done(); _, _ = s.get("tmdb"); _ = s.snapshot(); _ = s.providers() }()
	}
	wg.Wait()
	if _, ok := s.get("tmdb"); !ok {
		t.Error("tmdb missing after concurrent access")
	}
}

// A seed change must not leak into the store: newTTLStore copies its input.
func TestTTLStoreCopiesSeed(t *testing.T) {
	seed := map[string]time.Duration{"tmdb": time.Hour}
	s := newTTLStore(seed)
	seed["tmdb"] = time.Minute
	if got, _ := s.get("tmdb"); got != time.Hour {
		t.Errorf("store shares its seed map: got %v", got)
	}
}
