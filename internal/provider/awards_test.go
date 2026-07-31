package provider

import "testing"

func TestParseAwards(t *testing.T) {
	cases := []struct {
		name string
		in   string
		kind string
		won  bool
	}{
		// Real MDBList verdict-led strings.
		{"gwtw won oscar", "Won: Best Picture (Oscars, 1940). Plus 5 more Oscars & 3 Oscar nominations.", "oscar", true},
		{"godfather won oscar", "Won: Best Picture (Oscars, 1973). Plus 1 more Oscar, 4 Oscar nominations, 4 wins.", "oscar", true},
		{"inception won oscar", "Won: Best Achievement in Cinematography (Oscars, 2011). Plus 3 more Oscars, 4 Oscar nominations.", "oscar", true},
		{"shawshank nominated", "Nominated: Best Picture (Oscars, 1995). Plus 5 more Oscar nominations & 1 nomination.", "oscar", false},
		// Won something else, only Oscar-NOMINATED — must not be a winner.
		{"12 angry men won berlin", "Won: Berlin, 1957. Plus 2 Oscar nominations & 2 nominations.", "oscar", false},
		{"algiers won bafta", "Won: BAFTA, 1972. Plus 2 Oscar nominations & 1 more win.", "oscar", false},
		// Summary (IMDb-style) strings.
		{"summary won oscars", "Won 8 Oscars. 15 wins & 20 nominations total.", "oscar", true},
		{"summary won elsewhere", "Won 16 awards, including 3 Oscar nominations.", "oscar", false},
		{"summary nominated", "Nominated for 7 Oscars. 21 wins & 43 nominations total.", "oscar", false},
		// Emmy.
		{"emmy won", "Won: Outstanding Drama Series (Primetime Emmy, 2015).", "emmy", true},
		{"emmy nominated", "Nominated: Outstanding Comedy Series (Emmy, 2020).", "emmy", false},
		{"emmy won elsewhere", "Won 4 awards, including 2 Emmy nominations.", "emmy", false},
		// None.
		{"empty", "", "", false},
		{"bafta only", "Won 3 BAFTA awards.", "", false},
		{"leon empty", "", "", false},
	}
	for _, c := range cases {
		got := ParseAwards(c.in)
		if got.Kind != c.kind || got.Won != c.won {
			t.Errorf("%s: ParseAwards(%q) = %+v, want kind=%q won=%v", c.name, c.in, got, c.kind, c.won)
		}
	}
}

func TestAwardLabel(t *testing.T) {
	cases := map[AwardSummary]string{
		{Kind: "oscar", Won: true}:  "OSCAR WINNER",
		{Kind: "oscar", Won: false}: "OSCAR NOMINEE",
		{Kind: "emmy", Won: true}:   "EMMY WINNER",
		{}:                          "",
	}
	for a, want := range cases {
		if got := a.Label(); got != want {
			t.Errorf("%+v.Label() = %q, want %q", a, got, want)
		}
	}
}

// BUG-174: with the primary language "original" (empty) and a fallback set, logo
// selection must honour the fallback instead of falling through to the
// highest-voted logo of any language.
func TestFallbackLanguageReachesSelection(t *testing.T) {
	zh, en := "zh", "en"
	imgs := []tmdbImage{
		{FilePath: "/zh.png", Iso639: &zh, VoteAverage: 9, VoteCount: 100},
		{FilePath: "/en.png", Iso639: &en, VoteAverage: 3, VoteCount: 5},
	}
	// lang empty (original), fallback en: the English logo must win despite the
	// Chinese one being higher voted.
	got := selectImagePath(imgs, "", "", ArtworkOptions{FallbackLanguage: "en"})
	if got != "/en.png" {
		t.Errorf("selectImagePath fallback = %q, want /en.png", got)
	}
	// Without a fallback, the highest-voted of any language wins (the old path).
	if got := selectImagePath(imgs, "", "", ArtworkOptions{}); got != "/zh.png" {
		t.Errorf("no-fallback = %q, want /zh.png", got)
	}
}
