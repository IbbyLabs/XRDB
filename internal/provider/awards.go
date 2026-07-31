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
	var kind string
	switch {
	case strings.Contains(l, "oscar") || strings.Contains(l, "academy award"):
		kind = "oscar"
	case strings.Contains(l, "emmy"):
		kind = "emmy"
	default:
		return AwardSummary{}
	}
	// "won" anywhere means at least one was won; MDBList leads with the verdict
	// and only says "won" when something was actually won.
	won := strings.HasPrefix(l, "won") || strings.Contains(l, " won") || strings.Contains(l, "wins")
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
