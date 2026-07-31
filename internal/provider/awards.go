package provider

import "strings"

// ParseAwards reads a source's free-text awards line into a compact summary.
// MDBList reports lines like "Won: Best Picture (Oscars, 1973). Plus 1 more
// Oscar…" or "Nominated: Best Picture (Oscars, 1995). Plus 5 more Oscar
// nominations". The verdict is the leading word; the body names the body.
//
// Oscar is preferred over Emmy when both appear: a film with an Oscar is
// described by it, and a series that only has Emmys will name only Emmys.
func ParseAwards(s string) AwardSummary {
	l := strings.ToLower(strings.TrimSpace(s))
	if l == "" {
		return AwardSummary{}
	}
	// Verdict and award are both in the leading clause: "Won: Best Picture
	// (Oscars, 1973)…" / "Nominated for 7 Oscars. 21 wins…". Reading the whole
	// line lets a win counted elsewhere ("Plus 3 wins", "21 wins total") mislabel
	// a nomination as a win — a false claim on the artwork, which is worse than a
	// missed badge. So both signals come from the leading clause only.
	lead := l
	if i := strings.IndexAny(lead, ".;"); i > 0 {
		lead = lead[:i]
	}
	var kind string
	switch {
	case strings.Contains(lead, "oscar") || strings.Contains(lead, "academy award"):
		kind = "oscar"
	case strings.Contains(lead, "emmy"):
		kind = "emmy"
	default:
		return AwardSummary{}
	}
	// Only a leading "won" is a win; anything else is treated as a nomination.
	won := strings.HasPrefix(lead, "won")
	return AwardSummary{Kind: kind, Won: won}
}

// Label renders the summary as a short badge caption, or "" when there is none.
func (a AwardSummary) Label() string {
	if !a.Has() {
		return ""
	}
	name := "OSCAR"
	if a.Kind == "emmy" {
		name = "EMMY"
	}
	if a.Won {
		return name + " WINNER"
	}
	return name + " NOMINEE"
}
