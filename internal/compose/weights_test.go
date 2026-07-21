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

func TestWeightedAverageFavoursHeavierSources(t *testing.T) {
	cfg := imageconfig.Config{Ratings: []string{"imdb", "tmdb"}}

	plain, ok := ratingRingAverage(weightTestRatings(), cfg)
	if !ok || !closeTo(plain, 7.5) {
		t.Fatalf("unweighted average = %v (ok=%v), want 7.5", plain, ok)
	}

	// imdb counted three times over: (9*3 + 6*1) / 4.
	cfg.RatingProviderWeights = map[string]float64{"imdb": 3}
	weighted, ok := ratingRingAverage(weightTestRatings(), cfg)
	if !ok || !closeTo(weighted, 8.25) {
		t.Errorf("weighted average = %v (ok=%v), want 8.25", weighted, ok)
	}
}

func TestZeroWeightDropsASourceFromTheAverage(t *testing.T) {
	cfg := imageconfig.Config{Ratings: []string{"imdb", "tmdb"}}
	cfg.RatingProviderWeights = map[string]float64{"tmdb": 0}
	avg, ok := ratingRingAverage(weightTestRatings(), cfg)
	if !ok || !closeTo(avg, 9.0) {
		t.Errorf("average = %v (ok=%v), want 9.0 (imdb alone)", avg, ok)
	}

	// Every selected source zeroed leaves nothing to average, which reads the
	// same as having no ratings at all rather than as a score of zero.
	all := cfg
	all.RatingProviderWeights = map[string]float64{"imdb": 0, "tmdb": 0}
	if _, ok := ratingRingAverage(weightTestRatings(), all); ok {
		t.Error("expected no score when every source is weighted 0")
	}
}

func TestWeightsApplyToBothHalvesOfTheSplit(t *testing.T) {
	cfg := imageconfig.Config{Ratings: []string{"imdb", "tmdb", "rt", "metacritic"}}
	cfg.RatingProviderWeights = map[string]float64{"rt": 3, "tmdb": 0}
	critics, audience, hasC, hasA := splitCriticsAudience(weightTestRatings(), cfg)
	if !hasC || !hasA {
		t.Fatalf("expected both halves, got hasC=%v hasA=%v", hasC, hasA)
	}
	// Critics: (8*3 + 4*1) / 4. Audience: tmdb zeroed, so imdb alone.
	if !closeTo(critics, 7.0) {
		t.Errorf("critics = %v, want 7.0", critics)
	}
	if !closeTo(audience, 9.0) {
		t.Errorf("audience = %v, want 9.0", audience)
	}
}

func TestUnweightedConfigMatchesAPlainMean(t *testing.T) {
	// The feature has to be free when unused: no weights means the same number
	// the renderer produced before weights existed.
	cfg := imageconfig.Config{Ratings: []string{"imdb", "tmdb", "rt", "metacritic"}}
	avg, ok := ratingRingAverage(weightTestRatings(), cfg)
	if !ok || !closeTo(avg, (9.0+6.0+8.0+4.0)/4) {
		t.Errorf("average = %v (ok=%v), want the plain mean", avg, ok)
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

func TestZeroWeightIsSkippedBySingleSourceModes(t *testing.T) {
	cfg := imageconfig.Config{Ratings: []string{"imdb", "tmdb", "rt", "metacritic"}}
	cfg.RatingProviderWeights = map[string]float64{"imdb": 0, "rt": 0}
	// "highest" would pick imdb's 9.0, then rt's 8.0, but both are weighted
	// out, so the best remaining score wins.
	if v, ok := ratingRingSourceValue(weightTestRatings(), "highest", cfg); !ok || v != 6.0 {
		t.Errorf("highest = %v (ok=%v), want tmdb's 6.0", v, ok)
	}
	// Top critic skips rt and lands on metacritic.
	if v, ok := ratingRingSourceValue(weightTestRatings(), "priority-critics", cfg); !ok || v != 4.0 {
		t.Errorf("top critic = %v (ok=%v), want metacritic's 4.0", v, ok)
	}
}

func TestWeightsChangeTheRingRender(t *testing.T) {
	cfg := imageconfig.Config{
		Ratings:       []string{"imdb", "tmdb"},
		RatingRing:    true,
		RatingRingPos: "br",
	}
	plain := genreTestImage()
	drawAverageRatingRing(plain, weightTestRatings(), cfg, 2.0, newOccupancy(plain.Bounds()))

	weighted := cfg
	weighted.RatingProviderWeights = map[string]float64{"imdb": 5}
	img := genreTestImage()
	drawAverageRatingRing(img, weightTestRatings(), weighted, 2.0, newOccupancy(img.Bounds()))

	if !imagesDiffer(plain, img) {
		t.Error("provider weights did not change the ring render")
	}
}

func TestWeightsChangeTheAggregateBarRender(t *testing.T) {
	cfg := imageconfig.Config{Ratings: []string{"imdb", "tmdb"}, AggregateBar: true, AggregateBarPos: "bottom"}
	plain := genreTestImage()
	drawAggregateBar(plain, weightTestRatings(), cfg, nil, false)

	weighted := cfg
	weighted.RatingProviderWeights = map[string]float64{"tmdb": 0}
	img := genreTestImage()
	drawAggregateBar(img, weightTestRatings(), weighted, nil, false)

	if !imagesDiffer(plain, img) {
		t.Error("provider weights did not change the aggregate bar render")
	}
}
