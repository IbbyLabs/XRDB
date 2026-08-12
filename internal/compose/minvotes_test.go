package compose

import (
	"bytes"
	"image"
	"image/color"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

func thinSample() []provider.Rating {
	return []provider.Rating{
		{Source: "imdb", Value: 7.2, Votes: 148},
		{Source: "trakt", Value: 7.0, Votes: 5},
		{Source: "tmdb", Value: 7.1, Votes: 6},
		{Source: "metacritic", Value: 8.2, Votes: 22},
		{Source: "popcorn", Value: 9.8, Votes: 13},
		{Source: "rogerebert", Value: 3.5, Votes: 0},
		// Carries a default threshold and no count, which is the case that
		// distinguishes "unknown" from "below the line".
		{Source: "letterboxd", Value: 4.0, Votes: 0},
	}
}

func sourceSet(rs []provider.Rating) map[string]bool {
	out := map[string]bool{}
	for _, r := range rs {
		out[r.Source] = true
	}
	return out
}

// The reporter's case: a score resting on a handful of votes reads as confident
// as one resting on thousands.
func TestThinRatingsAreHidden(t *testing.T) {
	cfg := imageconfig.Config{RatingBadgeConfig: imageconfig.RatingBadgeConfig{RatingMinVotes: true}}
	kept, thin := splitThinRatings(thinSample(), cfg)
	got := sourceSet(kept)

	for _, s := range []string{"trakt", "tmdb"} {
		if got[s] {
			t.Errorf("%s kept with a single-digit vote count", s)
		}
	}
	if len(thin) != 2 {
		t.Errorf("thin = %v, want trakt and tmdb", thin)
	}
	if !got["imdb"] {
		t.Error("imdb dropped at 148 votes, which is thin but not meaningless")
	}
}

// Metacritic counts publications and Popcorn is unreliable per title (Citizen
// Kane reports 13), so a threshold on either deletes good data.
func TestExemptSourcesAreNeverHidden(t *testing.T) {
	// Set through the override, which is the only way to put a number on these
	// at all. Without it the assertion passes whether the exemption exists or
	// not, since neither source carries a built-in default.
	cfg := imageconfig.Config{RatingBadgeConfig: imageconfig.RatingBadgeConfig{
		RatingMinVotes:         true,
		RatingMinVotesBySource: map[string]int{"metacritic": 500, "popcorn": 500},
	}}
	kept, _ := splitThinRatings(thinSample(), cfg)
	got := sourceSet(kept)

	for _, s := range []string{"metacritic", "popcorn"} {
		if !got[s] {
			t.Errorf("%s was hidden, but its count does not measure confidence", s)
		}
	}
}

// Six sources report no count at all. Treating zero as below the threshold
// would empty them from every poster.
func TestASourceWithNoCountIsKept(t *testing.T) {
	cfg := imageconfig.Config{RatingBadgeConfig: imageconfig.RatingBadgeConfig{RatingMinVotes: true}}
	kept, _ := splitThinRatings(thinSample(), cfg)
	got := sourceSet(kept)
	if !got["rogerebert"] {
		t.Error("rogerebert hidden, but it reports no vote count to judge")
	}
	if !got["letterboxd"] {
		t.Error("letterboxd hidden at zero votes; zero means unknown, not thin")
	}
}

// Off by default: an unset config must render exactly as before.
func TestNothingIsHiddenWhenTheSwitchIsOff(t *testing.T) {
	kept, thin := splitThinRatings(thinSample(), imageconfig.Config{})
	if len(kept) != len(thinSample()) || len(thin) != 0 {
		t.Errorf("kept %d of %d with the switch off", len(kept), len(thinSample()))
	}
}

func TestAnOverrideBeatsTheDefaultAndZeroDisablesIt(t *testing.T) {
	cfg := imageconfig.Config{RatingBadgeConfig: imageconfig.RatingBadgeConfig{RatingMinVotes: true, RatingMinVotesBySource: map[string]int{"imdb": 1000}}}
	if kept, _ := splitThinRatings(thinSample(), cfg); sourceSet(kept)["imdb"] {
		t.Error("imdb kept at 148 votes against an override of 1000")
	}
	cfg.RatingMinVotesBySource = map[string]int{"trakt": 0}
	if kept, _ := splitThinRatings(thinSample(), cfg); !sourceSet(kept)["trakt"] {
		t.Error("a zero override should disable the threshold, not hide everything")
	}
}

// A source held back by a setting and a source that failed must not draw the
// same mark, or turning the threshold on costs the ability to see an outage.
func TestAWithheldSourceIsMarkedApartFromAFailedOne(t *testing.T) {
	withheld := badgeSpec{unavailable: true, withheld: true, valW: 40}
	failed := badgeSpec{unavailable: true, valW: 40}

	box := image.Rect(0, 0, 40, 40)
	col := color.NRGBA{R: 255, G: 255, B: 255, A: 255}

	a := image.NewNRGBA(box)
	drawWithheldDash(a, box, col, 2)
	b := image.NewNRGBA(box)
	drawUnavailableX(b, box, col, 2)

	if bytes.Equal(a.Pix, b.Pix) {
		t.Error("the withheld mark and the unavailable X rasterise identically")
	}
	if !withheld.withheld || failed.withheld {
		t.Error("the spec does not carry the distinction the draw path reads")
	}

	// The control: an empty draw is not what makes them differ.
	blank := image.NewNRGBA(box)
	if bytes.Equal(a.Pix, blank.Pix) {
		t.Error("the withheld mark drew nothing at all")
	}
}
