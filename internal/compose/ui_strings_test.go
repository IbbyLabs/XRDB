package compose

import (
	"testing"

	"xrdb_rewrite/internal/provider"
)

// Every string a badge draws that a contributor translated has to reach the
// render, or accepting the contribution means nothing (FR-149).
func TestTheContributedWordmarksReachTheirBadges(t *testing.T) {
	resetFamilyLabels(t)
	for _, tc := range []struct {
		name, got, want string
	}{
		{"digital release", must(releaseStatusLabel("digital", "pt")), "LANÇAMENTO DIGITAL"},
		{"in cinemas", must(releaseStatusLabel("cinemas", "pt")), "LANÇAMENTO NOS CINEMAS"},
		{"trending", UIString("trending", "pt", "TRENDING"), "EM ALTA"},
		{"age kicker", UIString("age_kicker", "pt", "AGE"), "IDADE"},
		{"top", UIString("top_rated", "pt", "TOP"), "TOP"},
		{"mid credits", stingerLabel(provider.StingerInfo{MidCredits: true}, "pt"), "CENA NO MEIO DOS CRÉDITOS"},
		{"post credits", stingerLabel(provider.StingerInfo{PostCredits: true}, "pt"), "CENA PÓS-CRÉDITOS"},
		{"both", stingerLabel(provider.StingerInfo{MidCredits: true, PostCredits: true}, "pt"), "CENA EXTRA (STINGER)"},
	} {
		if tc.got != tc.want {
			t.Errorf("%s = %q, want %q", tc.name, tc.got, tc.want)
		}
	}
}

// The outcome comes first in Portuguese and the preposition changes with it, so
// these cannot be a name joined to an outcome word.
func TestTheAwardPhrasesAreFourIndependentStrings(t *testing.T) {
	resetFamilyLabels(t)
	for _, tc := range []struct {
		a    provider.AwardSummary
		want string
	}{
		{provider.AwardSummary{Kind: "oscar", Won: true}, "VENCEDOR DO OSCAR"},
		{provider.AwardSummary{Kind: "oscar"}, "INDICADO AO OSCAR"},
		{provider.AwardSummary{Kind: "emmy", Won: true}, "VENCEDOR DO EMMY"},
		{provider.AwardSummary{Kind: "emmy"}, "INDICADO AO EMMY"},
	} {
		if got := awardsLabel(tc.a, "pt"); got != tc.want {
			t.Errorf("%+v = %q, want %q", tc.a, got, tc.want)
		}
	}
	// The control: English still comes from the concatenation it always did, so
	// a language with no entry costs nothing.
	if got := awardsLabel(provider.AwardSummary{Kind: "oscar", Won: true}, ""); got != "OSCAR WINNER" {
		t.Errorf("english = %q, want OSCAR WINNER", got)
	}
}

func must(label string, _ any, ok bool) string {
	if !ok {
		return ""
	}
	return label
}
