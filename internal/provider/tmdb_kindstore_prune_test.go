package provider

import (
	"testing"
	"time"
)

func TestKindStorePrunesExpiredMisses(t *testing.T) {
	s, err := openTMDBKindStore(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	s.db.SetMaxOpenConns(1)
	t.Cleanup(func() { _ = s.Close() })

	start := time.Unix(1_800_000_000, 0)
	for _, id := range []string{"1", "2", "3"} {
		s.rememberMiss(id, start)
	}
	s.rememberMiss("4", start.Add(tmdbKindMissTTL+tmdbKindPruneEvery))

	var n int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM tmdb_kind_misses`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Errorf("%d misses kept, want only the fresh one", n)
	}
}

func TestNumericIDHasALengthCap(t *testing.T) {
	if !isNumericID("123456789") || isNumericID("1234567890123") {
		t.Error("numeric id length cap is wrong")
	}
}
