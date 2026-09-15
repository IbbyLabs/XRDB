package provider

import "testing"

// BUG-288: Wikidata records a Metacritic score as "81/100" and the native value
// mode draws the provider's label as-is, so the denominator reached the badge.
func TestWikidataLabelDropsTheDenominator(t *testing.T) {
	for _, tc := range []struct {
		name string
		raw  string
		want string
	}{
		{"metacritic fraction", "81/100", "81"},
		{"fraction with spaces", " 74 / 100 ", "74"},
		{"rotten tomatoes percent keeps its unit", "91%", "91%"},
		{"a bare score is untouched", "68", "68"},
		{"a ten point fraction is still a value", "8/10", "8"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := wikidataLabel(tc.raw); got != tc.want {
				t.Errorf("wikidataLabel(%q) = %q, want %q", tc.raw, got, tc.want)
			}
		})
	}
}

// The value is read from the same raw string and must be unaffected: a label
// that stopped carrying the denominator would otherwise take the scale with it.
func TestWikidataScoreStillReadsTheFraction(t *testing.T) {
	got, ok := wikidataScore("81/100")
	if !ok || got != 8.1 {
		t.Errorf("wikidataScore(\"81/100\") = %v, %v; want 8.1, true", got, ok)
	}
}
