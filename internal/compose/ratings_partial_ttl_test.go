package compose

import (
	"context"
	"testing"
	"time"

	"xrdb_rewrite/internal/provider"
)

// A source metered by the day stops filling fields rather than failing once its
// allowance is spent. Held for the full term, one thin answer decides what the
// title looks like until the term runs out, long after the allowance resets.
func TestAPartialAnswerTakesTheShorterTerm(t *testing.T) {
	c := newRatingsCache(6*time.Hour, nil)

	_, err := c.do(context.Background(), "mdblist|movie|tt1", func(context.Context) (*provider.MediaMeta, bool, error) {
		return oneRating("imdb"), false, nil
	})
	if err != nil {
		t.Fatal(err)
	}

	entry, ok := c.entries["mdblist|movie|tt1"]
	if !ok {
		t.Fatal("a partial answer should still be remembered: re-asking on every render is what spends the allowance")
	}
	held := time.Until(entry.ExpiresAt)
	if held > PartialRatingsCacheTTL {
		t.Fatalf("a partial answer should be held for at most %s, got %s", PartialRatingsCacheTTL, held.Round(time.Second))
	}
}

func TestACompleteAnswerTakesTheFullTerm(t *testing.T) {
	c := newRatingsCache(6*time.Hour, nil)

	if _, err := c.do(context.Background(), "mdblist|movie|tt2", func(context.Context) (*provider.MediaMeta, bool, error) {
		return oneRating("imdb"), true, nil
	}); err != nil {
		t.Fatal(err)
	}

	entry := c.entries["mdblist|movie|tt2"]
	if held := time.Until(entry.ExpiresAt); held <= PartialRatingsCacheTTL {
		t.Fatalf("a complete answer should outlast the partial term, got %s", held.Round(time.Second))
	}
}

// The shorter term is a cap, not a floor: an instance configured with a TTL
// below it keeps its own.
func TestTheShorterTermNeverExtendsAConfiguredTTL(t *testing.T) {
	c := newRatingsCache(time.Minute, nil)

	if _, err := c.do(context.Background(), "mdblist|movie|tt3", func(context.Context) (*provider.MediaMeta, bool, error) {
		return oneRating("imdb"), false, nil
	}); err != nil {
		t.Fatal(err)
	}

	if held := time.Until(c.entries["mdblist|movie|tt3"].ExpiresAt); held > time.Minute {
		t.Fatalf("want the configured minute at most, got %s", held.Round(time.Second))
	}
}
