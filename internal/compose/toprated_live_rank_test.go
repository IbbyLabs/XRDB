package compose

import (
	"context"
	"testing"

	"xrdb_rewrite/internal/provider"
)

// stubRanker stands in for the IMDb dataset provider. It answers a rank the way
// the live table does, independently of anything a cached MediaMeta carries.
type stubRanker struct {
	ranks map[string]int
	on    bool
	asked []string
}

func (s *stubRanker) Name() string            { return "imdb_local" }
func (s *stubRanker) RatingSources() []string { return []string{"imdb"} }
func (s *stubRanker) RanksTitles() bool       { return s.on }
func (s *stubRanker) TopRatedRank(id string) int {
	s.asked = append(s.asked, id)
	return s.ranks[id]
}
func (s *stubRanker) Fetch(context.Context, string, string) (*provider.MediaMeta, error) {
	return nil, nil
}

func pipelineWithRanker(t *testing.T, r *stubRanker) *Pipeline {
	t.Helper()
	reg := provider.NewRegistry()
	reg.Register(r)
	return New(reg)
}

// The whole point of BUG-253: a meta that came back from the ratings cache
// carries the rank that was true when it was cached, which is 0 for anything
// rendered before the ranking finished building.
func TestCachedRankZeroIsReplacedByTheLiveOne(t *testing.T) {
	r := &stubRanker{on: true, ranks: map[string]int{"tt0111161": 1}}
	p := pipelineWithRanker(t, r)

	meta := &provider.MediaMeta{IMDbID: "tt0111161", TopRatedRank: 0}
	p.applyTopRatedRank(meta, "tt0111161")

	if meta.TopRatedRank != 1 {
		t.Fatalf("rank: got %d, want 1 — the cached 0 was not replaced", meta.TopRatedRank)
	}
}

// A title that has fallen out of the ranking must lose its badge rather than
// keep a stale place from whenever it was cached.
func TestCachedRankIsReplacedDownwardsToo(t *testing.T) {
	r := &stubRanker{on: true, ranks: map[string]int{}}
	p := pipelineWithRanker(t, r)

	meta := &provider.MediaMeta{IMDbID: "tt0111161", TopRatedRank: 7}
	p.applyTopRatedRank(meta, "tt0111161")

	if meta.TopRatedRank != 0 {
		t.Fatalf("rank: got %d, want 0 — a stale rank survived", meta.TopRatedRank)
	}
}

// The ranking is tt-keyed, so a request addressed by a TMDB number has to be
// looked up under the id a source resolved rather than the one asked with.
func TestTheResolvedIMDbIDIsPreferredOverTheRequestedOne(t *testing.T) {
	r := &stubRanker{on: true, ranks: map[string]int{"tt0111161": 3}}
	p := pipelineWithRanker(t, r)

	meta := &provider.MediaMeta{IMDbID: "tt0111161"}
	p.applyTopRatedRank(meta, "550")

	if meta.TopRatedRank != 3 {
		t.Fatalf("rank: got %d, want 3", meta.TopRatedRank)
	}
	if len(r.asked) != 1 || r.asked[0] != "tt0111161" {
		t.Fatalf("looked up %v, want [tt0111161]", r.asked)
	}
}

// An operator who has not switched the ranking on must not have a rank written
// onto their renders by this path.
func TestNoRankIsAppliedWhenTheRankingIsOff(t *testing.T) {
	r := &stubRanker{on: false, ranks: map[string]int{"tt0111161": 1}}
	p := pipelineWithRanker(t, r)

	meta := &provider.MediaMeta{IMDbID: "tt0111161", TopRatedRank: 4}
	p.applyTopRatedRank(meta, "tt0111161")

	if meta.TopRatedRank != 4 {
		t.Fatalf("rank: got %d, want 4 left alone", meta.TopRatedRank)
	}
	if len(r.asked) != 0 {
		t.Fatalf("the ranking was consulted while switched off: %v", r.asked)
	}
}

// A registry without the dataset provider at all must not panic the draw path.
func TestNoRankerIsHarmless(t *testing.T) {
	p := New(provider.NewRegistry())
	meta := &provider.MediaMeta{IMDbID: "tt0111161", TopRatedRank: 2}
	p.applyTopRatedRank(meta, "tt0111161")
	if meta.TopRatedRank != 2 {
		t.Fatalf("rank: got %d, want 2 untouched", meta.TopRatedRank)
	}
	p.applyTopRatedRank(nil, "tt0111161")
}
