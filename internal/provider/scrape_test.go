package provider

import "testing"

func TestFoldTitleIgnoresAccentsCaseAndPunctuation(t *testing.T) {
	// The whole point: a French or Polish spelling has to compare equal to the
	// plain one a metadata provider reports, or no title would ever match.
	same := [][2]string{
		{"Amélie", "amelie"},
		{"Léon: The Professional", "Leon The Professional"},
		{"WALL·E", "Wall E"},
		{"Nietykalni", "nietykalni"},
		{"Fight Club", "fight club"},
		{"Tom & Jerry", "Tom and Jerry"},
	}
	for _, pair := range same {
		if a, b := foldTitle(pair[0]), foldTitle(pair[1]); a != b {
			t.Errorf("foldTitle(%q)=%q, foldTitle(%q)=%q: want equal", pair[0], a, pair[1], b)
		}
	}
	if foldTitle("Dune") == foldTitle("Dune Part Two") {
		t.Error("distinct titles folded together")
	}
}

func TestTitleVariantsDropsDuplicatesAndBlanks(t *testing.T) {
	got := titleVariants("Amélie", "amelie", "", "Le Fabuleux Destin d'Amélie Poulain")
	if len(got) != 2 {
		t.Fatalf("variants = %v, want the two distinct spellings", got)
	}
	if got[0] != "Amélie" {
		t.Errorf("variants[0] = %q, want the first spelling kept as given", got[0])
	}
}

func TestTitleVariantsAreCapped(t *testing.T) {
	got := titleVariants("one", "two", "three", "four", "five")
	if len(got) != maxTitleVariants {
		t.Errorf("variants = %d, want a cap of %d", len(got), maxTitleVariants)
	}
}

func TestScoreTitleMatchRanksExactAboveLoose(t *testing.T) {
	wanted := foldAll([]string{"Dune"})
	exact := scoreTitleMatch("Dune", wanted)
	prefix := scoreTitleMatch("Dune: Part Two", wanted)
	none := scoreTitleMatch("Arrival", wanted)
	if exact <= prefix || prefix <= none {
		t.Errorf("expected exact > prefix > none, got %d, %d, %d", exact, prefix, none)
	}
	if none != 0 {
		t.Errorf("unrelated title scored %d, want 0", none)
	}
}

func TestDecodeHTMLEntities(t *testing.T) {
	cases := [][2]string{
		{"Tom &amp; Jerry", "Tom & Jerry"},
		{"L&#39;Auberge", "L'Auberge"},
		{"caf&#xe9;", "café"},
		{"&quot;Heat&quot;", `"Heat"`},
		// An ampersand that arrives already decoded must not swallow what
		// follows it into a second round of decoding.
		{"AT&amp;amp;T", "AT&amp;T"},
	}
	for _, c := range cases {
		if got := decodeHTMLEntities(c[0]); got != c[1] {
			t.Errorf("decodeHTMLEntities(%q) = %q, want %q", c[0], got, c[1])
		}
	}
}

func TestParseRatingNumberHandlesEuropeanFormatting(t *testing.T) {
	cases := []struct {
		in   string
		want float64
		ok   bool
	}{
		{"4,1", 4.1, true},
		{" 7.8 ", 7.8, true},
		{"7,8/10", 7.8, true},
		{"--", 0, false},
		{"0", 0, false}, // a zero score is "no score", not a real one
		{"", 0, false},
	}
	for _, c := range cases {
		got, ok := parseRatingNumber(c.in)
		if ok != c.ok || (ok && got != c.want) {
			t.Errorf("parseRatingNumber(%q) = %v, %v; want %v, %v", c.in, got, ok, c.want, c.ok)
		}
	}
}

func TestYearOf(t *testing.T) {
	if got := yearOf("2008-07-16"); got != 2008 {
		t.Errorf("yearOf(release date) = %d, want 2008", got)
	}
	if got := yearOf("sortie le 3 juillet 1999"); got != 1999 {
		t.Errorf("yearOf(prose) = %d, want 1999", got)
	}
	if got := yearOf("no year here"); got != 0 {
		t.Errorf("yearOf(none) = %d, want 0", got)
	}
}
