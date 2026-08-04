package curated

import "testing"

// The list ships with the binary, so an empty or unparseable bundle would make
// every lookup answer "not on the list" and every mark quietly disappear.
func TestTheBundledListLoaded(t *testing.T) {
	if n := Size(GreatMovies); n < 300 {
		t.Fatalf("great-movies holds %d titles; the bundle did not load", n)
	}
}

func TestContainsAnswersFromTheList(t *testing.T) {
	cases := []struct {
		name      string
		id        string
		on, known bool
	}{
		// The distinction the mark exists to draw: an essay, not a good review.
		// The Dark Knight was reviewed warmly and never got a Great Movies essay.
		{"a great movie", "tt0033467", true, true},
		{"the essay's Usher", "tt0018873", true, true},
		{"the other 1928 Usher", "tt0018770", false, true},
		{"reviewed but no essay", "tt0468569", false, true},

		// Case and whitespace come from whatever a provider stored.
		{"upper case id", "TT0033467", true, true},
		{"padded id", "  tt0033467 ", true, true},

		// Not answerable. A TMDB id cannot be looked up in a tt-keyed list, and
		// saying "not on the list" would be a claim nobody checked.
		{"tmdb numeric id", "550", false, false},
		{"empty id", "", false, false},
	}
	for _, c := range cases {
		on, known := Contains(GreatMovies, c.id)
		if on != c.on || known != c.known {
			t.Errorf("%s: Contains(%q) = (%v, %v), want (%v, %v)", c.name, c.id, on, known, c.on, c.known)
		}
	}
}

// An unknown list name must not answer "no". Silently reporting absence for a
// list that does not exist would make a typo look like an empty collection.
func TestAnUnknownListIsNotAnswerable(t *testing.T) {
	on, known := Contains("no-such-list", "tt0033467")
	if on || known {
		t.Errorf("Contains on an unknown list = (%v, %v), want (false, false)", on, known)
	}
}
