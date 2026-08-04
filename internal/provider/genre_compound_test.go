package provider

import (
	"slices"
	"testing"
)

// Keyword sets read from TMDB rather than invented, so the fixture is what the
// rule actually runs against. They are a snapshot: keywords are community
// edited, so a drifting title matters less than the rule staying right.
var (
	kwGameOfThrones = []string{"kingdom", "dragon", "based on novel or book", "fantasy world"}
	kwObiWan        = []string{"space", "jedi", "based on movie", "sequel"}
	kwOutlander     = []string{"scotland", "time travel", "magic", "based on novel or book"}
	kwLucifer       = []string{"los angeles", "police", "detective", "based on comic"}
	kwWillow        = []string{"high fantasy", "quest", "sorceress"}
)

func TestNarrowSciFiFantasyPicksASide(t *testing.T) {
	tests := []struct {
		name     string
		keywords []string
		want     string
	}{
		{"fantasy signal only", kwGameOfThrones, genreFantasy},
		{"sci-fi signal only", kwObiWan, genreSciFi},
		// "high fantasy" is the case that settles substring matching: an exact
		// comparison against "fantasy" drops it.
		{"a compound keyword still counts", kwWillow, genreFantasy},
		{"both buckets leaves it alone", kwOutlander, ""},
		{"no signal leaves it alone", kwLucifer, ""},
		{"no keywords at all leaves it alone", nil, ""},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := narrowSciFiFantasy(tc.keywords, ""); got != tc.want {
				t.Errorf("narrowed to %q, want %q", got, tc.want)
			}
		})
	}
}

// The overrides exist for the two cases the keywords cannot settle, and they are
// the only titles allowed to bypass the rule.
func TestCompoundOverridesSettleWhatKeywordsCannot(t *testing.T) {
	if got := narrowSciFiFantasy(kwOutlander, "56570"); got != genreFantasy {
		t.Errorf("Outlander with both buckets matched resolved %q, want the override to force %q", got, genreFantasy)
	}
	if got := narrowSciFiFantasy(kwLucifer, "63174"); got != genreFantasy {
		t.Errorf("Lucifer with no signal resolved %q, want the override to force %q", got, genreFantasy)
	}
	// An unlisted title with the same ambiguity keeps the compound, so the
	// override list is doing the work rather than the ambiguity resolving itself.
	if got := narrowSciFiFantasy(kwOutlander, "999999"); got != "" {
		t.Errorf("an unlisted tie resolved %q, want the compound left alone", got)
	}
}

func TestNarrowCompoundGenresRewritesOnlyTheCompound(t *testing.T) {
	got := narrowCompoundGenres(
		[]string{"Sci-Fi & Fantasy", "Drama", "Action & Adventure"}, kwGameOfThrones, "1399")
	want := []string{"Fantasy", "Drama", "Action & Adventure"}
	if !slices.Equal(got, want) {
		t.Errorf("got %v, want %v", got, want)
	}
}

func TestNarrowCompoundGenresLeavesOtherListsAlone(t *testing.T) {
	// A film already has the two genres separately, so there is nothing to do.
	film := []string{"Fantasy", "Adventure"}
	if got := narrowCompoundGenres(film, kwGameOfThrones, "120"); !slices.Equal(got, film) {
		t.Errorf("a list without the compound came back as %v", got)
	}
	// A title the rule cannot settle keeps the compound, which is what makes this
	// unable to make any title worse than it is today.
	tie := []string{"Sci-Fi & Fantasy", "Drama"}
	if got := narrowCompoundGenres(tie, kwOutlander, "999999"); !slices.Equal(got, tie) {
		t.Errorf("an unsettled title came back as %v, want the compound kept", got)
	}
}

// TMDB spells it "Sci-Fi & Fantasy"; the renderer folds separators before
// comparing, so the narrowing has to recognise the same spellings it does.
func TestCompoundSpellings(t *testing.T) {
	for _, spelling := range []string{"Sci-Fi & Fantasy", "sci fi & fantasy", "SCI_FI & FANTASY"} {
		if !isSciFiFantasyCompound(spelling) {
			t.Errorf("%q was not recognised as the compound", spelling)
		}
	}
	for _, other := range []string{"Fantasy", "Science Fiction", "Action & Adventure"} {
		if isSciFiFantasyCompound(other) {
			t.Errorf("%q was treated as the compound", other)
		}
	}
}
