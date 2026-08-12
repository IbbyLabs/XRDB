package animemap

import (
	"context"
	"testing"
	"time"
)

// A season that aired recently carries a Kitsu id for weeks before TMDB or IMDb
// list it. Before this the row was skipped at index time, so the id resolved to
// nothing and the render returned nothing at all (FR-182).
func TestARowWithOnlyAKitsuIdIsStillIndexed(t *testing.T) {
	rev := map[string]reverseEntry{}
	ranks := map[string]int{}
	ids := IDs{MAL: 63832, Kitsu: 50634}

	insertTarget(rev, ranks, ids, Target{}, 0)

	e, ok := rev[animeKey("mal", 63832)]
	if !ok {
		t.Fatal("a row with a Kitsu id and no mainstream id was not indexed")
	}
	if e.Kitsu != 50634 {
		t.Errorf("Kitsu = %d, want 50634", e.Kitsu)
	}
	if !e.Target.empty() {
		t.Errorf("target = %+v, want empty — this row has no mainstream id", e.Target)
	}
}

// The control that keeps the index from tripling: a row nothing can draw is
// still skipped. Kitsu is the only anime service XRDB has artwork for, so a row
// with neither a mainstream id nor a Kitsu one can never produce a poster.
func TestARowNothingCanDrawIsStillSkipped(t *testing.T) {
	rev := map[string]reverseEntry{}
	ranks := map[string]int{}

	insertTarget(rev, ranks, IDs{MAL: 1, AniList: 2, AniDB: 3}, Target{}, 0)

	if len(rev) != 0 {
		t.Errorf("indexed %d keys for a row with no mainstream and no Kitsu id", len(rev))
	}
}

// ResolveTarget must keep answering false for a Kitsu-only row, or every caller
// that expects a mainstream id starts receiving an empty one.
func TestResolveTargetStillDeclinesAKitsuOnlyRow(t *testing.T) {
	m := mapperWith(t, map[string]reverseEntry{
		animeKey("mal", 63832): {Kitsu: 50634},
	})
	if _, ok := m.ResolveTarget(context.Background(), "mal:63832"); ok {
		t.Error("ResolveTarget answered for a row with no mainstream id")
	}
	kitsu, ok := m.ResolveKitsu(context.Background(), "mal:63832")
	if !ok || kitsu != 50634 {
		t.Errorf("ResolveKitsu = (%d, %v), want (50634, true)", kitsu, ok)
	}
}

// Translating a Kitsu id to itself buys nothing and would loop a caller that
// retries on a rewrite.
func TestResolveKitsuDeclinesAnIdThatIsAlreadyKitsu(t *testing.T) {
	m := mapperWith(t, map[string]reverseEntry{
		animeKey("kitsu", 50634): {Kitsu: 50634},
	})
	if _, ok := m.ResolveKitsu(context.Background(), "kitsu:50634"); ok {
		t.Error("ResolveKitsu translated a Kitsu id to itself")
	}
}

func mapperWith(t *testing.T, rev map[string]reverseEntry) *Mapper {
	t.Helper()
	// loadedAt inside the ttl, or ensureLoaded treats the source as stale and
	// kicks a background refresh that reaches the network from a unit test.
	src := &source{byAnimeID: rev, loaded: true, loadedAt: time.Now(), ttl: time.Hour}
	return &Mapper{primary: src}
}
