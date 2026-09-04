package compose

import (
	"math"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

// weightTestRatings spans both halves of the critics/audience split so one set
// covers the ring, the pills, and the aggregate bar.
func weightTestRatings() []provider.Rating {
	return []provider.Rating{
		{Source: "imdb", Value: 9.0, Label: "9.0"},
		{Source: "tmdb", Value: 6.0, Label: "6.0"},
		{Source: "rt", Value: 8.0, Label: "80%"},         // critic
		{Source: "metacritic", Value: 4.0, Label: "40%"}, // critic
	}
}

func closeTo(got, want float64) bool { return math.Abs(got-want) < 0.0001 }

func TestSharesDecideHowMuchEachSourceCounts(t *testing.T) {
	cfg := imageconfig.Config{Ratings: []string{"imdb", "tmdb"}}

	even, ok := ratingRingAverage(weightTestRatings(), cfg)
	if !ok || !closeTo(even, 7.5) {
		t.Fatalf("even split = %v (ok=%v), want 7.5", even, ok)
	}

	// 75% imdb, 25% tmdb: 9*0.75 + 6*0.25.
	cfg.RatingProviderWeights = map[string]float64{"imdb": 75, "tmdb": 25}
	weighted, ok := ratingRingAverage(weightTestRatings(), cfg)
	if !ok || !closeTo(weighted, 8.25) {
		t.Errorf("75/25 split = %v (ok=%v), want 8.25", weighted, ok)
	}
}

func TestUnsetSourcesSplitWhatIsLeftOfTheHundred(t *testing.T) {
	// Only imdb is pinned, so tmdb and rt divide the remaining 40 between them.
	// 9*0.6 + 6*0.2 + 8*0.2.
	cfg := imageconfig.Config{Ratings: []string{"imdb", "tmdb", "rt"}}
	cfg.RatingProviderWeights = map[string]float64{"imdb": 60}
	avg, ok := ratingRingAverage(weightTestRatings(), cfg)
	if !ok || !closeTo(avg, 8.2) {
		t.Errorf("partial shares = %v (ok=%v), want 8.2", avg, ok)
	}
}

func TestNoSharesIsAnEvenSplit(t *testing.T) {
	// The feature has to be free when unused: no shares means the same number
	// the renderer produced before shares existed.
	cfg := imageconfig.Config{Ratings: []string{"imdb", "tmdb", "rt", "metacritic"}}
	avg, ok := ratingRingAverage(weightTestRatings(), cfg)
	if !ok || !closeTo(avg, (9.0+6.0+8.0+4.0)/4) {
		t.Errorf("average = %v (ok=%v), want the plain mean", avg, ok)
	}
}

func TestZeroShareDropsASource(t *testing.T) {
	cfg := imageconfig.Config{Ratings: []string{"imdb", "tmdb"}}
	cfg.RatingProviderWeights = map[string]float64{"imdb": 100, "tmdb": 0}
	avg, ok := ratingRingAverage(weightTestRatings(), cfg)
	if !ok || !closeTo(avg, 9.0) {
		t.Errorf("average = %v (ok=%v), want 9.0 (imdb alone)", avg, ok)
	}

	// Every selected source on zero leaves nothing to average, which reads the
	// same as having no ratings at all rather than as a score of zero.
	all := cfg
	all.RatingProviderWeights = map[string]float64{"imdb": 0, "tmdb": 0}
	if _, ok := ratingRingAverage(weightTestRatings(), all); ok {
		t.Error("expected no score when every source is on a zero share")
	}
}

func TestAMissingSourceHandsItsShareToTheRest(t *testing.T) {
	// rogerebert is selected and carries a third of the score, but this title
	// has no Roger Ebert rating. The other two should split the whole score
	// between them in proportion rather than the missing one scoring zero.
	cfg := imageconfig.Config{Ratings: []string{"imdb", "tmdb", "rogerebert"}}
	cfg.RatingProviderWeights = map[string]float64{"imdb": 50, "tmdb": 30, "rogerebert": 20}
	avg, ok := ratingRingAverage(weightTestRatings(), cfg)
	// 50/80 imdb + 30/80 tmdb, not 9*0.5 + 6*0.3 + 0*0.2.
	if !ok || !closeTo(avg, (9.0*50+6.0*30)/80) {
		t.Errorf("average = %v (ok=%v), want the share spread over what has data", avg, ok)
	}
}

func TestSharesApplyToBothHalvesOfTheSplit(t *testing.T) {
	cfg := imageconfig.Config{Ratings: []string{"imdb", "tmdb", "rt", "metacritic"}}
	cfg.RatingProviderWeights = map[string]float64{"imdb": 40, "tmdb": 0, "rt": 45, "metacritic": 15}
	critics, audience, hasC, hasA := splitCriticsAudience(weightTestRatings(), cfg)
	if !hasC || !hasA {
		t.Fatalf("expected both halves, got hasC=%v hasA=%v", hasC, hasA)
	}
	// Each half keeps the sources' relative shares: critics 45:15, audience is
	// imdb alone once tmdb is zeroed.
	if !closeTo(critics, (8.0*45+4.0*15)/60) {
		t.Errorf("critics = %v, want the 45:15 blend", critics)
	}
	if !closeTo(audience, 9.0) {
		t.Errorf("audience = %v, want 9.0", audience)
	}
}

func TestRingPriorityOrderIsConfigurable(t *testing.T) {
	cfg := imageconfig.Config{Ratings: []string{"rt", "metacritic", "imdb", "tmdb"}}

	// Built-in order puts rt ahead of metacritic.
	if v, ok := ratingRingSourceValue(weightTestRatings(), "priority-critics", cfg); !ok || v != 8.0 {
		t.Errorf("default critics priority = %v (ok=%v), want rt's 8.0", v, ok)
	}

	flipped := cfg
	flipped.RingCriticsPriority = []string{"metacritic", "rt"}
	if v, ok := ratingRingSourceValue(weightTestRatings(), "priority-critics", flipped); !ok || v != 4.0 {
		t.Errorf("configured critics priority = %v (ok=%v), want metacritic's 4.0", v, ok)
	}

	audience := cfg
	audience.RingAudiencePriority = []string{"tmdb", "imdb"}
	if v, ok := ratingRingSourceValue(weightTestRatings(), "priority-audience", audience); !ok || v != 6.0 {
		t.Errorf("configured audience priority = %v (ok=%v), want tmdb's 6.0", v, ok)
	}
}

func TestPriorityFallsThroughSourcesWithoutAScore(t *testing.T) {
	// A configured order names sources this title may not have; the first one
	// that actually carries a value wins rather than the mode giving up.
	cfg := imageconfig.Config{Ratings: []string{"rt", "metacritic"}}
	cfg.RingCriticsPriority = []string{"rogerebert", "metacritic", "rt"}
	if v, ok := ratingRingSourceValue(weightTestRatings(), "priority-critics", cfg); !ok || v != 4.0 {
		t.Errorf("priority = %v (ok=%v), want metacritic's 4.0", v, ok)
	}
}

func TestZeroShareIsSkippedBySingleSourceModes(t *testing.T) {
	cfg := imageconfig.Config{Ratings: []string{"imdb", "tmdb", "rt", "metacritic"}}
	cfg.RatingProviderWeights = map[string]float64{"imdb": 0, "rt": 0, "tmdb": 50, "metacritic": 50}
	// "highest" would pick imdb's 9.0, then rt's 8.0, but both are on a zero
	// share, so the best remaining score wins.
	if v, ok := ratingRingSourceValue(weightTestRatings(), "highest", cfg); !ok || v != 6.0 {
		t.Errorf("highest = %v (ok=%v), want tmdb's 6.0", v, ok)
	}
	// Top critic skips rt and lands on metacritic.
	if v, ok := ratingRingSourceValue(weightTestRatings(), "priority-critics", cfg); !ok || v != 4.0 {
		t.Errorf("top critic = %v (ok=%v), want metacritic's 4.0", v, ok)
	}
}

func TestSharesChangeTheRingRender(t *testing.T) {
	cfg := imageconfig.Config{
		Ratings:       []string{"imdb", "tmdb"},
		RatingRing:    true,
		RatingRingPos: "br",
	}
	even := genreTestImage()
	drawAverageRatingRing(even, weightTestRatings(), cfg, 2.0, newOccupancy(even.Bounds()))

	weighted := cfg
	weighted.RatingProviderWeights = map[string]float64{"imdb": 90, "tmdb": 10}
	img := genreTestImage()
	drawAverageRatingRing(img, weightTestRatings(), weighted, 2.0, newOccupancy(img.Bounds()))

	if !imagesDiffer(even, img) {
		t.Error("provider shares did not change the ring render")
	}
}

func TestSharesChangeTheAggregateBarRender(t *testing.T) {
	cfg := imageconfig.Config{Ratings: []string{"imdb", "tmdb"}, AggregateBar: true, AggregateBarPos: "bottom"}
	even := genreTestImage()
	drawAggregateBar("", even, weightTestRatings(), cfg, nil, false)

	weighted := cfg
	weighted.RatingProviderWeights = map[string]float64{"imdb": 100, "tmdb": 0}
	img := genreTestImage()
	drawAggregateBar("", img, weightTestRatings(), weighted, nil, false)

	if !imagesDiffer(even, img) {
		t.Error("provider shares did not change the aggregate bar render")
	}
}
