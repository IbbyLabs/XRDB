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
		// Both buckets or neither now resolves to its own family rather than being
		// left as TMDB's compound (FR-163).
		{"both buckets is genuinely both", kwOutlander, genreSciFantasy},
		{"no signal is unsettled either way", kwLucifer, genreSciFantasy},
		{"no keywords at all", nil, genreSciFantasy},
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
	// The claim is that the LIST settles it, not the ambiguity: an unlisted tie
	// must not reach Fantasy on its own. It now lands on the both-buckets family
	// instead of the raw compound, which still separates the two cases.
	if got := narrowSciFiFantasy(kwOutlander, "999999"); got != genreSciFantasy {
		t.Errorf("an unlisted tie resolved %q, want %q", got, genreSciFantasy)
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
	// An unsettled title used to keep TMDB's compound. It now names the family that
	// says it is both, which is the half FR-147 left unbuilt.
	tie := []string{"Sci-Fi & Fantasy", "Drama"}
	wantTie := []string{genreSciFantasy, "Drama"}
	if got := narrowCompoundGenres(tie, kwOutlander, "999999"); !slices.Equal(got, wantTie) {
		t.Errorf("an unsettled title came back as %v, want %v", got, wantTie)
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

// Good Omens carries no fantasy keyword. Under substring matching it resolved
// Fantasy on "witch" found inside "witch hunt" — the right answer for a reason
// that would not survive TMDB editing the keyword. This is the case that tells
// whole-word matching from substring matching: any title that resolves the same
// way under both proves nothing about which is implemented.
var kwGoodOmens = []string{"angel", "prophecy", "anti-christ", "armageddon", "demon", "witch hunt"}

func TestWholeWordMatchingDoesNotFindTermsInsideKeywords(t *testing.T) {
	// Still discriminates: substring matching would find "witch" in "witch hunt"
	// and answer Fantasy. Whole-word matching finds neither bucket, so the title
	// lands on the both-or-neither family.
	if got := narrowSciFiFantasy(kwGoodOmens, ""); got != genreSciFantasy {
		t.Errorf("resolved %q from keywords carrying no fantasy term; "+
			"'witch' inside 'witch hunt' means matching is still on substrings", got)
	}
	// With the override it resolves, which is why the title still reads Fantasy.
	if got := narrowSciFiFantasy(kwGoodOmens, "71915"); got != genreFantasy {
		t.Errorf("Good Omens with its override resolved %q, want %q", got, genreFantasy)
	}
}

// The case whole-word matching could plausibly break, and the reason substring
// matching was chosen first: Willow's only signal is the phrase "high fantasy".
func TestPhraseKeywordsStillMatch(t *testing.T) {
	for _, phrase := range []string{"high fantasy", "dark fantasy", "urban fantasy", "fantasy world", "sword and sorcery"} {
		if got := narrowSciFiFantasy([]string{phrase}, ""); got != genreFantasy {
			t.Errorf("keyword %q resolved %q, want %q", phrase, got, genreFantasy)
		}
	}
}

// A hyphenated bucket term has to survive the same folding the keyword gets, or
// it can never match anything.
func TestHyphenatedTermsMatch(t *testing.T) {
	if got := narrowSciFiFantasy([]string{"post apocalyptic"}, ""); got != genreSciFi {
		t.Errorf("a post-apocalyptic keyword resolved %q, want %q", got, genreSciFi)
	}
}
