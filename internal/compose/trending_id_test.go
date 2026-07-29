package compose

import (
	"context"
	"testing"

	"xrdb_rewrite/internal/provider"
)

// recordingTrending captures the ids a render offers the trending index.
type recordingTrending struct {
	got  []string
	hits map[string]bool
}

func (r *recordingTrending) IsTrending(_ context.Context, ids ...string) bool {
	r.got = append([]string(nil), ids...)
	for _, id := range ids {
		if r.hits[id] {
			return true
		}
	}
	return false
}

// The trending list TMDB serves carries no external ids, so the index is keyed
// by TMDB id alone. A request made under an IMDb id therefore has to offer the
// TMDB id resolved during the metadata fetch, or it can never match.
func TestATitleRequestedByIMDbIDStillMatchesTheTrendingList(t *testing.T) {
	idx := &recordingTrending{hits: map[string]bool{"1368337": true}}
	p := &Pipeline{trending: idx}

	meta := &provider.MediaMeta{IMDbID: "tt33764258", TMDBID: "1368337"}
	if !p.isTrending(context.Background(), Request{MediaID: "tt33764258"}, meta) {
		t.Fatalf("a tt request did not reach the trending list; offered %v", idx.got)
	}

	var sawTMDB bool
	for _, id := range idx.got {
		if id == "1368337" {
			sawTMDB = true
		}
	}
	if !sawTMDB {
		t.Errorf("the resolved TMDB id was never offered, got %v", idx.got)
	}
}

// A title outside the list stays outside it whichever id form asks.
func TestATitleAbsentFromTheTrendingListDrawsNoBadge(t *testing.T) {
	idx := &recordingTrending{hits: map[string]bool{"1368337": true}}
	p := &Pipeline{trending: idx}

	meta := &provider.MediaMeta{IMDbID: "tt0111161", TMDBID: "278"}
	if p.isTrending(context.Background(), Request{MediaID: "tt0111161"}, meta) {
		t.Error("a title that is not trending reported as trending")
	}
}
