package provider

import "testing"

func TestParseAwards(t *testing.T) {
	cases := []struct {
		in   string
		kind string
		won  bool
	}{
		{"Won: Best Picture (Oscars, 1973). Plus 1 more Oscar, 4 Oscar nominations.", "oscar", true},
		{"Nominated: Best Picture (Oscars, 1995). Plus 5 more Oscar nominations & 1 nomination.", "oscar", false},
		{"Won: Outstanding Drama Series (Primetime Emmy, 2015).", "emmy", true},
		{"Nominated: Outstanding Comedy Series (Emmy, 2020).", "emmy", false},
		{"", "", false},
		{"Won 3 BAFTA awards", "", false}, // neither Oscar nor Emmy
		{"Nominated for 7 Oscars. 21 wins & 43 nominations total.", "oscar", false},
		{"Won 3 Oscars. 15 wins & 20 nominations total.", "oscar", true},
		{"Nominated: Best Picture (Oscars, 2020). Plus 3 wins & 2 nominations.", "oscar", false},
		{"Won: Best Costume (BAFTA, 1985). Plus 1 Oscar nomination.", "", false},
	}
	for _, c := range cases {
		got := ParseAwards(c.in)
		if got.Kind != c.kind || got.Won != c.won {
			t.Errorf("ParseAwards(%q) = %+v, want kind=%q won=%v", c.in, got, c.kind, c.won)
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
